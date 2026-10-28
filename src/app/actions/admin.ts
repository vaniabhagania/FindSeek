"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criterionViolation } from "@/lib/admin/criteria-guard";
import { buildOutcomeEmail } from "@/lib/admin/emails";
import { evaluate, type Criterion, type CriterionKind } from "@/lib/admin/screening";
import { getRecruiter } from "@/lib/admin/session";
import { payFromForm, type PayFields } from "@/lib/admin/pay-input";
import { MODEL } from "@/lib/ai/client";
import { screenCandidate, type ApplicationSnapshot } from "@/lib/ai/screen-candidate";
import { logAiAction } from "@/lib/data/profile";
import { sendEmail } from "@/lib/email/send";
import { isAiConfigured, isEmailConfigured } from "@/lib/env";
import { enrichJob } from "@/lib/jobs/enrich";
import { MAX_POST_CHARS } from "@/lib/limits";
import { noticeUrl, type NoticeCode } from "@/lib/notices";
import { createServiceClient } from "@/lib/supabase/server";

// Server Actions are reachable by direct POST, so each one re-checks that the caller acts for an
// employer and that the post / application belongs to that employer. Row level security is the
// second lock, not the only one.

const SCREENINGS_PER_RUN = 10;
const MAX_CRITERIA_PER_POST = 30;
const CRITERION_KINDS: CriterionKind[] = ["hard_requirement", "must_have", "nice_to_have"];

/** Redirects back to `path` with a code the Notice component looks up. Never put free text in here. */
function fail(path: string, code: NoticeCode, extra?: Record<string, string>): never {
  redirect(noticeUrl(path, code, extra));
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
  if (name.length < 2 || name.length > 120) fail("/admin", "org_name");

  const id = randomUUID();
  const { error: employerError } = await supabase.from("employers").insert({ id, name, created_by: user.id });
  if (employerError) fail("/admin", "employer_create");
  const { error: memberError } = await supabase.from("employer_members").insert({ employer_id: id, user_id: user.id, role: "owner" });
  if (memberError) fail("/admin", "employer_setup");

  revalidatePath("/admin");
  redirect("/admin");
}

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

interface PostFields {
  title: string;
  description: string;
  location: string | null;
  remote: boolean | null;
  pay: PayFields;
}

/** The opening form, checked. Anything wrong sends the recruiter back to `path` with a fixed message. */
function readPostForm(formData: FormData, path: string): PostFields {
  const title = text(formData.get("title"));
  const description = text(formData.get("description"));
  if (title.length < 2 || title.length > 160) fail(path, "post_title");
  if (description.length < 40 || description.length > MAX_POST_CHARS) fail(path, "post_description");

  const work = text(formData.get("work_style"));
  const paid = payFromForm(text(formData.get("pay_min")), text(formData.get("pay_max")), text(formData.get("pay_unit")));
  if (!paid.ok) fail(path, paid.reason === "missing" ? "post_pay" : "post_pay_range");
  return {
    title,
    description,
    location: text(formData.get("location")) || null,
    remote: work === "remote" ? true : work === "onsite" || work === "hybrid" ? false : null,
    pay: paid.pay,
  };
}

export async function createPost(formData: FormData) {
  const r = await requireRecruiter();
  const f = readPostForm(formData, "/admin/posts/new");
  const { data: post, error } = await r.supabase
    .from("job_posts")
    .insert({
      employer_id: r.employer.id,
      title: f.title,
      description: f.description,
      location: f.location,
      country_code: "in",
      remote: f.remote,
      pay_min_inr: f.pay.min,
      pay_max_inr: f.pay.max,
      pay_period: f.pay.period,
    })
    .select("id")
    .single();
  if (error || !post) fail("/admin/posts/new", "post_save");

  revalidatePath("/admin");
  redirect(`/admin/posts/${post.id}`);
}

type PostRow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- rows come from an untyped client

/** The opening as a listing, run through the same gate as every other source. */
function postAsListing(r: Recruiter, post: PostRow, jobId: string, now: string) {
  return enrichJob({
    source: "manual",
    external_id: post.id,
    company: r.employer.name,
    title: post.title,
    location: post.location,
    country_code: post.country_code ?? "in",
    remote: post.remote,
    description: post.description,
    apply_url: `/jobs/${jobId}`,
    salary_min: post.pay_min_inr,
    salary_max: post.pay_max_inr,
    salary_currency: post.pay_min_inr != null ? "INR" : null,
    posted_at: post.published_at ?? now,
  });
}

/** Stops with the list of missing checks when the listing would not be verified. */
function requireVerified(enriched: ReturnType<typeof enrichJob>, path: string, code: "unpublishable" | "edit_unpublishable"): void {
  if (enriched.verification_status === "verified") return;
  const failed = enriched.verification_checks.filter((c) => !c.ok).map((c) => c.key);
  fail(path, code, { checks: failed.join(",") });
}

/** Writes the verified listing into the shared jobs table. Only the server may do this. */
async function mirrorToJobs(admin: NonNullable<ReturnType<typeof createServiceClient>>, post: PostRow, jobId: string, enriched: ReturnType<typeof enrichJob>, now: string, path: string) {
  const { error } = await admin.from("jobs").upsert(
    {
      id: jobId,
      ...enriched,
      // Keep the employer's own period so a stipend shows per month.
      pay_period: post.pay_period ?? enriched.pay_period,
      last_seen_at: now,
      closed_at: null,
    },
    { onConflict: "source,external_id" },
  );
  if (error) fail(path, "publish_failed");
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
  if (!admin) fail(path, "service_key");

  const jobId: string = post.job_id ?? randomUUID();
  const now = new Date().toISOString();
  const enriched = postAsListing(r, post, jobId, now);
  requireVerified(enriched, path, "unpublishable");
  await mirrorToJobs(admin, post, jobId, enriched, now, path);

  const { error: postError } = await admin
    .from("job_posts")
    .update({ job_id: jobId, status: "open", published_at: post.published_at ?? new Date().toISOString() })
    .eq("id", post.id)
    .eq("employer_id", r.employer.id);
  if (postError) fail(path, "publish_failed");

  revalidatePath(path);
  revalidatePath("/admin");
  revalidatePath("/jobs");
  redirect(path);
}

/**
 * Edits an opening. A draft or closed opening is simply saved; it goes through the gate when it is
 * published. An open one is live in candidates' feeds, so the edit must still pass every check
 * before anything is saved, and the listing candidates see is updated with it.
 */
export async function updatePost(postId: string, formData: FormData) {
  const r = await requireRecruiter();
  const post = await loadOwnPost(r, postId);
  const editPath = `/admin/posts/${post.id}/edit`;
  const f = readPostForm(formData, editPath);

  const edited: PostRow = {
    ...post,
    title: f.title,
    description: f.description,
    location: f.location,
    remote: f.remote,
    pay_min_inr: f.pay.min,
    pay_max_inr: f.pay.max,
    pay_period: f.pay.period,
  };

  const live = post.status === "open" && Boolean(post.job_id);
  const now = new Date().toISOString();
  let admin: ReturnType<typeof createServiceClient> = null;
  let enriched: ReturnType<typeof enrichJob> | null = null;
  if (live) {
    admin = createServiceClient();
    if (!admin) fail(editPath, "service_key");
    enriched = postAsListing(r, edited, post.job_id, now);
    requireVerified(enriched, editPath, "edit_unpublishable");
  }

  // The database refuses a recruiter's own session editing an opening that is live (migration 0007),
  // so the gate above cannot be skipped by calling the API directly. A checked live edit is written
  // with the server key; a draft or closed opening is still the recruiter's to edit.
  const writer = live && admin ? admin : r.supabase;
  const { error } = await writer
    .from("job_posts")
    .update({
      title: f.title,
      description: f.description,
      location: f.location,
      remote: f.remote,
      pay_min_inr: f.pay.min,
      pay_max_inr: f.pay.max,
      pay_period: f.pay.period,
    })
    .eq("id", post.id)
    .eq("employer_id", r.employer.id);
  if (error) fail(editPath, "post_save");

  if (live && admin && enriched) await mirrorToJobs(admin, edited, post.job_id, enriched, now, editPath);

  revalidatePath(`/admin/posts/${post.id}`);
  revalidatePath("/admin");
  if (live) {
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${post.job_id}`);
  }
  redirect(`/admin/posts/${post.id}?saved=${live ? "live" : "1"}`);
}

export async function closePost(postId: string) {
  const r = await requireRecruiter();
  const post = await loadOwnPost(r, postId);
  const path = `/admin/posts/${post.id}`;

  // Status is the server's to change (migration 0007), so closing is written with the server key.
  const admin = createServiceClient();
  if (!admin) fail(path, "service_key");

  // Take it out of candidates' feeds first, so a failure part-way never leaves a closed opening live.
  if (post.job_id) {
    const { error: listingError } = await admin.from("jobs").update({ closed_at: new Date().toISOString() }).eq("id", post.job_id);
    if (listingError) fail(path, "post_save");
  }
  const { error } = await admin.from("job_posts").update({ status: "closed" }).eq("id", post.id).eq("employer_id", r.employer.id);
  if (error) fail(path, "post_save");

  revalidatePath(path);
  revalidatePath("/admin");
  revalidatePath("/jobs");
  if (post.job_id) revalidatePath(`/jobs/${post.job_id}`);
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
  if (!CRITERION_KINDS.includes(kind)) fail(path, "criterion_kind");
  if (criterion.length < 3 || criterion.length > 300) fail(path, "criterion_length");
  const blocked = criterionViolation(criterion);
  if (blocked !== null) fail(path, `criterion_${blocked}`);

  const { count } = await r.supabase
    .from("screening_criteria").select("id", { count: "exact", head: true }).eq("job_post_id", post.id);
  if ((count ?? 0) >= MAX_CRITERIA_PER_POST) fail(path, "criterion_max");

  const { error } = await r.supabase.from("screening_criteria").insert({ job_post_id: post.id, kind, text: criterion });
  if (error) fail(path, "criterion_save");

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
  if (!isAiConfigured) fail(path, "ai_unconfigured");

  const { data: criteriaRows } = await r.supabase
    .from("screening_criteria").select("id, kind, text").eq("job_post_id", post.id).order("created_at");
  const criteria = (criteriaRows ?? []) as Criterion[];
  if (!criteria.length) fail(path, "no_criteria");

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
  if (decision !== "selected" && decision !== "not_selected") fail(path, "decision_kind");
  const note = text(formData.get("note")).slice(0, 1000);
  if (application.status === "withdrawn") fail(path, "withdrawn");

  const { data: existingEmail } = await r.supabase
    .from("candidate_emails").select("id, kind, status").eq("post_application_id", application.id).maybeSingle();
  if (existingEmail?.status === "sent") fail(path, "email_locked");

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
  if (error) fail(path, "decision_save");
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
  if (!subject || subject.length > 200) fail(path, "draft_subject");
  if (body.length < 20 || body.length > 5000) fail(path, "draft_body");

  const { error } = await r.supabase
    .from("candidate_emails").update({ subject, body }).eq("post_application_id", applicationId).neq("status", "sent");
  if (error) fail(path, "draft_save");
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
  if (!email || !decision) fail(path, "no_decision");
  if (email.status === "sent") fail(path, "email_sent");
  if (email.kind !== decision.decision) fail(path, "email_mismatch");
  if (!isEmailConfigured) fail(path, "email_unconfigured");
  const content = formData?.has("subject") ? await persistDraft(r, application.id, path, formData) : { subject: email.subject, body: email.body };

  // The candidate's address lives in auth, not in our tables. Fetch it only now, only to send.
  const admin = createServiceClient();
  const { data: candidate } = admin ? await admin.auth.admin.getUserById(application.user_id) : { data: null };
  const to = candidate?.user?.email;
  if (!to) fail(path, "no_recipient");

  try {
    await sendEmail({ to, subject: content.subject, text: content.body, replyTo: r.user.email });
  } catch (e) {
    await r.supabase.from("candidate_emails")
      .update({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "Send failed" })
      .eq("id", email.id);
    revalidatePath(path);
    fail(path, "email_rejected");
  }

  await r.supabase.from("candidate_emails")
    .update({ status: "sent", error: null, sent_by: r.user.id, sent_at: new Date().toISOString() })
    .eq("id", email.id);
  revalidatePath(path);
  revalidatePath(`/admin/posts/${post.id}`);
  redirect(`${path}?sent=1`);
}
