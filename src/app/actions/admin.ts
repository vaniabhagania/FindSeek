"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkCriterionText } from "@/lib/admin/criteria-guard";
import { buildOutcomeEmail } from "@/lib/admin/emails";
import { evaluate, type Criterion, type CriterionKind } from "@/lib/admin/screening";
import { getRecruiter } from "@/lib/admin/session";
import { MODEL } from "@/lib/ai/client";
import { screenCandidate, type ApplicationSnapshot } from "@/lib/ai/screen-candidate";
import { logAiAction } from "@/lib/data/profile";
import { sendEmail } from "@/lib/email/send";
import { isAiConfigured, isEmailConfigured } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

// Server Actions are reachable by direct POST, so each one re-checks that the caller acts for an
// employer and that the post / application belongs to that employer. Row level security is the
// second lock, not the only one.

const SCREENINGS_PER_RUN = 10;
const MAX_CRITERIA_PER_POST = 30;
const CRITERION_KINDS: CriterionKind[] = ["hard_requirement", "must_have", "nice_to_have"];

/** Redirects back to `path` with a message the Notice component shows. */
function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function requireRecruiter() {
  const { supabase, user, employer } = await getRecruiter();
  if (!supabase || !user) redirect("/login");
  if (!employer) redirect("/admin");
  return { supabase, user, employer };
}

type Recruiter = Awaited<ReturnType<typeof requireRecruiter>>;

/** The post, only if it belongs to the recruiter's employer. */
async function loadOwnPost(r: Recruiter, postId: string) {
  const { data: post } = await r.supabase
    .from("job_posts").select("*").eq("id", postId).eq("employer_id", r.employer.id).maybeSingle();
  if (!post) redirect("/admin");
  return post;
}

/** The application, only if it was made to one of the recruiter's employer's posts. */
async function loadOwnApplication(r: Recruiter, postId: string, applicationId: string) {
  const post = await loadOwnPost(r, postId);
  const { data: application } = await r.supabase
    .from("post_applications").select("*").eq("id", applicationId).eq("job_post_id", post.id).maybeSingle();
  if (!application) redirect(`/admin/posts/${post.id}`);
  return { post, application };
}

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();

// ---------------------------------------------------------------------------
// Employer account
// ---------------------------------------------------------------------------

export async function createEmployer(formData: FormData) {
  const { supabase, user, employer } = await getRecruiter();
  if (!supabase || !user) redirect("/login");
  if (employer) redirect("/admin");

  const name = text(formData.get("name"));
  if (name.length < 2 || name.length > 120) fail("/admin", "Enter your organisation's name (2 to 120 characters).");

  const id = randomUUID();
  const { error: employerError } = await supabase.from("employers").insert({ id, name, created_by: user.id });
  if (employerError) fail("/admin", "Couldn't create the employer account. Please try again.");
  const { error: memberError } = await supabase.from("employer_members").insert({ employer_id: id, user_id: user.id, role: "owner" });
  if (memberError) fail("/admin", "Couldn't finish setting up the employer account. Please try again.");

  revalidatePath("/admin");
  redirect("/admin");
}

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

export async function createPost(formData: FormData) {
  const r = await requireRecruiter();
  const title = text(formData.get("title"));
  const description = text(formData.get("description"));
  if (title.length < 2 || title.length > 160) fail("/admin/posts/new", "Give the opening a title (2 to 160 characters).");
  if (description.length < 40) fail("/admin/posts/new", "Describe the role in at least 40 characters so candidates can judge their fit.");

  const work = text(formData.get("work_style"));
  const { data: post, error } = await r.supabase
    .from("job_posts")
    .insert({
      employer_id: r.employer.id,
      title,
      description,
      location: text(formData.get("location")) || null,
      country_code: text(formData.get("country_code")).toLowerCase() || null,
      remote: work === "remote" ? true : work === "onsite" ? false : null,
    })
    .select("id")
    .single();
  if (error || !post) fail("/admin/posts/new", "Couldn't save the opening. Please try again.");

  revalidatePath("/admin");
  redirect(`/admin/posts/${post.id}`);
}

/**
 * Publishing mirrors the opening into the shared jobs table (source 'manual') so candidates see it,
 * get a match score and tailor a CV through the normal flow. Only the server may write jobs.
 */
export async function publishPost(postId: string) {
  const r = await requireRecruiter();
  const post = await loadOwnPost(r, postId);
  const path = `/admin/posts/${post.id}`;

  const admin = createServiceClient();
  if (!admin) fail(path, "SUPABASE_SERVICE_ROLE_KEY isn't set, so openings can't be published yet.");

  const jobId: string = post.job_id ?? randomUUID();
  const { error: jobError } = await admin.from("jobs").upsert(
    {
      id: jobId,
      source: "manual",
      external_id: post.id,
      company: r.employer.name,
      title: post.title,
      location: post.location,
      country_code: post.country_code,
      remote: post.remote,
      description: post.description,
      apply_url: `/jobs/${jobId}`,
      posted_at: post.published_at ?? new Date().toISOString(),
      scam_flags: [],
    },
    { onConflict: "source,external_id" },
  );
  if (jobError) fail(path, "Couldn't publish the opening. Please try again.");

  const { error: postError } = await admin
    .from("job_posts")
    .update({ job_id: jobId, status: "open", published_at: post.published_at ?? new Date().toISOString() })
    .eq("id", post.id)
    .eq("employer_id", r.employer.id);
  if (postError) fail(path, "Couldn't publish the opening. Please try again.");

  revalidatePath(path);
  revalidatePath("/admin");
  revalidatePath("/jobs");
  redirect(path);
}

export async function closePost(postId: string) {
  const r = await requireRecruiter();
  const post = await loadOwnPost(r, postId);
  await r.supabase.from("job_posts").update({ status: "closed" }).eq("id", post.id);
  revalidatePath(`/admin/posts/${post.id}`);
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Criteria
// ---------------------------------------------------------------------------

/** Criteria changed, so briefs for undecided candidates are stale. Clear them to force a fresh screening. */
async function resetUndecidedScreenings(r: Recruiter, postId: string) {
  const { data: apps } = await r.supabase
    .from("post_applications").select("id").eq("job_post_id", postId).in("status", ["submitted", "screened"]);
  const ids = (apps ?? []).map((a) => a.id);
  if (!ids.length) return;
  await r.supabase.from("candidate_screenings").delete().in("post_application_id", ids);
  await r.supabase.from("post_applications").update({ status: "submitted" }).in("id", ids);
}

export async function addCriterion(postId: string, formData: FormData) {
  const r = await requireRecruiter();
  const post = await loadOwnPost(r, postId);
  const path = `/admin/posts/${post.id}`;

  const kind = text(formData.get("kind")) as CriterionKind;
  const criterion = text(formData.get("text"));
  if (!CRITERION_KINDS.includes(kind)) fail(path, "Choose what kind of criterion this is.");
  if (criterion.length < 3 || criterion.length > 300) fail(path, "A criterion needs 3 to 300 characters.");
  const blocked = checkCriterionText(criterion);
  if (blocked) fail(path, blocked);

  const { count } = await r.supabase
    .from("screening_criteria").select("id", { count: "exact", head: true }).eq("job_post_id", post.id);
  if ((count ?? 0) >= MAX_CRITERIA_PER_POST) fail(path, `An opening can have at most ${MAX_CRITERIA_PER_POST} criteria.`);

  const { error } = await r.supabase.from("screening_criteria").insert({ job_post_id: post.id, kind, text: criterion });
  if (error) fail(path, "Couldn't save the criterion. Please try again.");

  await resetUndecidedScreenings(r, post.id);
  revalidatePath(path);
  redirect(path);
}

export async function deleteCriterion(postId: string, criterionId: string) {
  const r = await requireRecruiter();
  const post = await loadOwnPost(r, postId);
  await r.supabase.from("screening_criteria").delete().eq("id", criterionId).eq("job_post_id", post.id);
  await resetUndecidedScreenings(r, post.id);
  revalidatePath(`/admin/posts/${post.id}`);
}

// ---------------------------------------------------------------------------
// AI brief
// ---------------------------------------------------------------------------

/** Screens submitted applications against the criteria. Produces recommendations only. */
export async function screenCandidates(postId: string) {
  const r = await requireRecruiter();
  const post = await loadOwnPost(r, postId);
  const path = `/admin/posts/${post.id}`;
  if (!isAiConfigured) fail(path, "ANTHROPIC_API_KEY isn't set, so candidates can't be screened yet.");

  const { data: criteriaRows } = await r.supabase
    .from("screening_criteria").select("id, kind, text").eq("job_post_id", post.id).order("created_at");
  const criteria = (criteriaRows ?? []) as Criterion[];
  if (!criteria.length) fail(path, "Add at least one criterion before screening candidates.");

  const { data: apps } = await r.supabase
    .from("post_applications").select("id, snapshot").eq("job_post_id", post.id).eq("status", "submitted")
    .order("submitted_at").limit(SCREENINGS_PER_RUN);

  const results = await Promise.allSettled(
    (apps ?? []).map(async (app) => {
      const ai = await screenCandidate(post, criteria, app.snapshot as ApplicationSnapshot);
      const outcome = evaluate(criteria, ai.criteria_results);
      const { error } = await r.supabase.from("candidate_screenings").upsert(
        {
          post_application_id: app.id,
          score: outcome.score,
          recommendation: outcome.recommendation,
          criteria_results: outcome.results,
          reasons: outcome.reasons,
          summary: ai.summary,
          model: MODEL,
        },
        { onConflict: "post_application_id" },
      );
      if (error) throw error;
      await r.supabase.from("post_applications").update({ status: "screened" }).eq("id", app.id);
      await logAiAction(r.supabase, {
        user_id: r.user.id,
        action: "screen_candidate",
        model: MODEL,
        input_ref: app.id,
        output_summary: `${outcome.recommendation} (score ${outcome.score}); a person decides`,
      });
    }),
  );
  const failed = results.filter((x) => x.status === "rejected").length;
  revalidatePath(path);
  redirect(`${path}?screened=${results.length - failed}${failed ? `&failed=${failed}` : ""}`);
}

// ---------------------------------------------------------------------------
// Human decision and outcome email
// ---------------------------------------------------------------------------

export async function decideCandidate(postId: string, applicationId: string, formData: FormData) {
  const r = await requireRecruiter();
  const { post, application } = await loadOwnApplication(r, postId, applicationId);
  const path = `/admin/posts/${post.id}/candidates/${application.id}`;

  const decision = text(formData.get("decision"));
  if (decision !== "selected" && decision !== "not_selected") fail(path, "Choose selected or not selected.");
  const note = text(formData.get("note")).slice(0, 1000);
  if (application.status === "withdrawn") fail(path, "This candidate has withdrawn their application.");

  const { data: existingEmail } = await r.supabase
    .from("candidate_emails").select("id, kind, status").eq("post_application_id", application.id).maybeSingle();
  if (existingEmail?.status === "sent") fail(path, "The outcome email has already been sent, so the decision can't be changed.");

  const { data: screening } = await r.supabase
    .from("candidate_screenings").select("recommendation").eq("post_application_id", application.id).maybeSingle();

  const { error } = await r.supabase.from("hiring_decisions").upsert(
    {
      post_application_id: application.id,
      decided_by: r.user.id,
      decision,
      ai_recommendation: screening?.recommendation ?? null,
      note: note || null,
      decided_at: new Date().toISOString(),
    },
    { onConflict: "post_application_id" },
  );
  if (error) fail(path, "Couldn't record the decision. Please try again.");
  await r.supabase.from("post_applications").update({ status: decision }).eq("id", application.id);

  // Draft the outcome email, unless a draft for this same outcome already exists (it may have been edited).
  if (!existingEmail || existingEmail.kind !== decision) {
    const draft = buildOutcomeEmail({
      kind: decision,
      candidateName: application.candidate_name,
      jobTitle: post.title,
      company: r.employer.name,
    });
    await r.supabase.from("candidate_emails").upsert(
      { post_application_id: application.id, kind: decision, subject: draft.subject, body: draft.body, status: "draft", error: null },
      { onConflict: "post_application_id" },
    );
  }

  revalidatePath(path);
  revalidatePath(`/admin/posts/${post.id}`);
  redirect(`${path}?decided=1`);
}

/** Validates and saves the subject and body from the draft form. Returns what was saved. */
async function persistDraft(r: Recruiter, applicationId: string, path: string, formData: FormData) {
  const subject = text(formData.get("subject"));
  const body = text(formData.get("body"));
  if (!subject || subject.length > 200) fail(path, "The subject needs 1 to 200 characters.");
  if (body.length < 20 || body.length > 5000) fail(path, "The email body needs 20 to 5,000 characters.");

  const { error } = await r.supabase
    .from("candidate_emails").update({ subject, body }).eq("post_application_id", applicationId).neq("status", "sent");
  if (error) fail(path, "Couldn't save the draft. Please try again.");
  return { subject, body };
}

export async function saveEmailDraft(postId: string, applicationId: string, formData: FormData) {
  const r = await requireRecruiter();
  const { post, application } = await loadOwnApplication(r, postId, applicationId);
  const path = `/admin/posts/${post.id}/candidates/${application.id}`;
  await persistDraft(r, application.id, path, formData);
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

/** Sends the outcome email. If the draft form was submitted with it, its edits are saved first so none are lost. */
export async function sendOutcomeEmail(postId: string, applicationId: string, formData?: FormData) {
  const r = await requireRecruiter();
  const { post, application } = await loadOwnApplication(r, postId, applicationId);
  const path = `/admin/posts/${post.id}/candidates/${application.id}`;

  const [{ data: email }, { data: decision }] = await Promise.all([
    r.supabase.from("candidate_emails").select("*").eq("post_application_id", application.id).maybeSingle(),
    r.supabase.from("hiring_decisions").select("decision").eq("post_application_id", application.id).maybeSingle(),
  ]);
  if (!email || !decision) fail(path, "Record a decision first.");
  if (email.status === "sent") fail(path, "This email has already been sent.");
  if (email.kind !== decision.decision) fail(path, "The draft doesn't match the decision. Record the decision again to regenerate it.");
  if (!isEmailConfigured) fail(path, "RESEND_API_KEY and EMAIL_FROM aren't set, so emails can't be sent yet.");
  const content = formData?.has("subject") ? await persistDraft(r, application.id, path, formData) : { subject: email.subject, body: email.body };

  // The candidate's address lives in auth, not in our tables. Fetch it only now, only to send.
  const admin = createServiceClient();
  const { data: candidate } = admin ? await admin.auth.admin.getUserById(application.user_id) : { data: null };
  const to = candidate?.user?.email;
  if (!to) fail(path, "Couldn't find an email address for this candidate.");

  try {
    await sendEmail({ to, subject: content.subject, text: content.body, replyTo: r.user.email });
  } catch (e) {
    await r.supabase.from("candidate_emails")
      .update({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "Send failed" })
      .eq("id", email.id);
    revalidatePath(path);
    fail(path, "The email provider rejected the message. Check the sender settings and try again.");
  }

  await r.supabase.from("candidate_emails")
    .update({ status: "sent", error: null, sent_by: r.user.id, sent_at: new Date().toISOString() })
    .eq("id", email.id);
  revalidatePath(path);
  revalidatePath(`/admin/posts/${post.id}`);
  redirect(`${path}?sent=1`);
}
