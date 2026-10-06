"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MODEL } from "@/lib/ai/client";
import { scoreMatch } from "@/lib/ai/score-match";
import { tailorCv } from "@/lib/ai/tailor-cv";
import { keywordScore, loadVerifiedProfile, logAiAction } from "@/lib/data/profile";
import { getUser } from "@/lib/supabase/server";

const MATCHES_PER_RUN = 8;

async function requireReadyUser() {
  const { supabase, user } = await getUser();
  if (!supabase || !user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile?.consent_ai_processing_at) redirect("/profile?error=consent");
  return { supabase, user, profile };
}

/** Scores the most promising unscored jobs against the user's verified profile. */
export async function findMatches() {
  const { supabase, user } = await requireReadyUser();
  const verified = await loadVerifiedProfile(supabase, user.id);
  if (!verified.experiences.length) redirect("/profile?error=noverified");

  const [{ data: jobs }, { data: scored }] = await Promise.all([
    supabase.from("jobs").select("id, company, title, location, description").order("posted_at", { ascending: false }).limit(500),
    supabase.from("job_matches").select("job_id").eq("user_id", user.id),
  ]);
  const seen = new Set((scored ?? []).map((m) => m.job_id));

  const candidates = (jobs ?? [])
    .filter((j) => !seen.has(j.id))
    .map((j) => ({ job: j, kw: keywordScore(verified, j) }))
    .filter((c) => c.kw > 0)
    .sort((a, b) => b.kw - a.kw)
    .slice(0, MATCHES_PER_RUN);

  const results = await Promise.allSettled(
    candidates.map(async ({ job }) => {
      const match = await scoreMatch(verified, job);
      await supabase.from("job_matches").upsert({
        user_id: user.id, job_id: job.id, score: match.score,
        strengths: match.strengths, gaps: match.gaps, summary: match.summary,
      }, { onConflict: "user_id,job_id" });
      await logAiAction(supabase, {
        user_id: user.id, action: "score_match", model: MODEL, input_ref: job.id,
        output_summary: `score ${match.score}: ${match.summary}`,
      });
    }),
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  revalidatePath("/jobs");
  redirect(`/jobs?scored=${candidates.length - failed}${failed ? `&failed=${failed}` : ""}`);
}

export async function dismissMatch(matchId: string) {
  const { supabase } = await requireReadyUser();
  await supabase.from("job_matches").update({ dismissed: true }).eq("id", matchId);
  revalidatePath("/jobs");
}

/** Creates (or reuses) the application and generates a new tailored CV version. */
export async function tailorForJob(jobId: string) {
  const { supabase, user } = await requireReadyUser();
  const verified = await loadVerifiedProfile(supabase, user.id);
  if (!verified.experiences.length) redirect("/profile?error=noverified");

  const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).single();
  if (!job) redirect("/jobs");

  const { data: application } = await supabase
    .from("applications")
    .upsert({ user_id: user.id, job_id: jobId, status: "tailoring" }, { onConflict: "user_id,job_id" })
    .select()
    .single();
  if (!application) throw new Error("Could not create application");

  const { cv, warnings } = await tailorCv(verified, job);
  const { count } = await supabase
    .from("tailored_documents").select("id", { count: "exact", head: true }).eq("application_id", application.id);

  await supabase.from("tailored_documents").insert({
    user_id: user.id,
    application_id: application.id,
    version: (count ?? 0) + 1,
    cv,
    cover_letter: cv.cover_letter,
    change_log: cv.change_log,
    fabrication_warnings: warnings,
  });
  await supabase.from("applications").update({ status: "ready" }).eq("id", application.id);
  await logAiAction(supabase, {
    user_id: user.id, action: "tailor_cv", model: MODEL, input_ref: jobId,
    output_summary: `${cv.change_log.length} changes, ${warnings.length} fabrication warnings`,
  });
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function approveDocument(jobId: string, documentId: string, formData: FormData) {
  const { supabase } = await requireReadyUser();
  const { data: doc } = await supabase.from("tailored_documents").select("fabrication_warnings").eq("id", documentId).single();
  if (!doc) redirect(`/jobs/${jobId}`);
  if (doc.fabrication_warnings.length && formData.get("ack_warnings") !== "on") {
    redirect(`/jobs/${jobId}?error=ack`);
  }
  await supabase.from("tailored_documents").update({ approved_at: new Date().toISOString() }).eq("id", documentId);
  revalidatePath(`/jobs/${jobId}`);
}

/** The user submits on the employer's site; this records it, within their monthly cap. */
export async function markApplied(jobId: string, applicationId: string) {
  const { supabase, user, profile } = await requireReadyUser();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("applications").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("applied_at", monthStart.toISOString());
  if ((count ?? 0) >= profile.monthly_application_cap) redirect(`/jobs/${jobId}?error=cap`);

  const { data: approved } = await supabase
    .from("tailored_documents").select("id").eq("application_id", applicationId)
    .not("approved_at", "is", null).limit(1);
  if (!approved?.length) redirect(`/jobs/${jobId}?error=approve`);

  await supabase.from("applications").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", applicationId);
  revalidatePath("/tracker");
  redirect("/tracker");
}

/**
 * Submits the approved tailored CV to an employer's opening posted on FindSeek. Unlike an external
 * listing, the employer receives it here, so the candidate must agree to the sharing and to AI-assisted
 * screening first. What is shared is a snapshot of the approved CV, nothing else from the profile.
 */
export async function submitToEmployer(jobId: string, applicationId: string, formData: FormData) {
  const { supabase, user, profile } = await requireReadyUser();
  const back = (error: string) => redirect(`/jobs/${jobId}?error=${encodeURIComponent(error)}`);

  if (formData.get("consent_share") !== "on" || formData.get("consent_screening") !== "on") {
    back("Tick both boxes to confirm you agree to share your CV and to AI-assisted screening.");
  }

  const { data: post } = await supabase.from("job_posts").select("id, status").eq("job_id", jobId).maybeSingle();
  if (!post) redirect(`/jobs/${jobId}`);
  if (post.status !== "open") back("This opening is closed and no longer accepting applications.");

  const { data: application } = await supabase
    .from("applications").select("id").eq("id", applicationId).eq("user_id", user.id).maybeSingle();
  if (!application) redirect(`/jobs/${jobId}`);

  const { data: existing } = await supabase
    .from("post_applications").select("id").eq("job_post_id", post.id).eq("user_id", user.id).maybeSingle();
  if (existing) back("You've already applied to this opening.");

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("applications").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("applied_at", monthStart.toISOString());
  if ((count ?? 0) >= profile.monthly_application_cap) redirect(`/jobs/${jobId}?error=cap`);

  const { data: doc } = await supabase
    .from("tailored_documents").select("cv, cover_letter").eq("application_id", application.id)
    .not("approved_at", "is", null).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!doc) redirect(`/jobs/${jobId}?error=approve`);

  const now = new Date().toISOString();
  const { error } = await supabase.from("post_applications").insert({
    job_post_id: post.id,
    user_id: user.id,
    application_id: application.id,
    candidate_name: profile.full_name,
    snapshot: { location: profile.location, cv: doc.cv, cover_letter: doc.cover_letter },
    consent_shared_at: now,
    consent_ai_screening_at: now,
  });
  if (error) back("Couldn't submit your application. Please try again.");

  await supabase.from("applications").update({ status: "applied", applied_at: now }).eq("id", application.id);
  revalidatePath("/tracker");
  redirect("/tracker");
}

/** Withdraws an application the employer hasn't decided on yet. */
export async function withdrawFromEmployer(jobId: string) {
  const { supabase, user } = await requireReadyUser();
  const { data: post } = await supabase.from("job_posts").select("id").eq("job_id", jobId).maybeSingle();
  if (post) {
    await supabase.rpc("withdraw_post_application", { pid: post.id });
    // Only mirror it in the tracker if the withdrawal actually took effect (not once a decision is made).
    const { data: submitted } = await supabase
      .from("post_applications").select("status").eq("job_post_id", post.id).eq("user_id", user.id).maybeSingle();
    if (submitted?.status === "withdrawn") {
      await supabase.from("applications").update({ status: "withdrawn" }).eq("user_id", user.id).eq("job_id", jobId);
    }
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/tracker");
}

export async function setApplicationStatus(applicationId: string, formData: FormData) {
  const { supabase } = await requireReadyUser();
  const status = String(formData.get("status"));
  // "applied" is only reachable through markApplied (approval + monthly cap).
  const allowed = ["saved", "ready", "interview", "offer", "rejected", "withdrawn"];
  if (!allowed.includes(status)) return;
  await supabase.from("applications").update({ status }).eq("id", applicationId);
  revalidatePath("/tracker");
}
