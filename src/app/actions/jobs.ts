"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MODEL } from "@/lib/ai/client";
import { extractListing } from "@/lib/ai/extract-listing";
import { scoreMatch } from "@/lib/ai/score-match";
import { tailorCv } from "@/lib/ai/tailor-cv";
import { keywordScore, loadVerifiedProfile, logAiAction, preferencesOf } from "@/lib/data/profile";
import { requireQuota } from "@/lib/data/quota";
import { enrichJob } from "@/lib/jobs/enrich";
import { JOB_FEED_COLUMNS } from "@/lib/jobs/feed";
import { fitChecks, fitSummary } from "@/lib/jobs/fit";
import { checkStillOpen } from "@/lib/jobs/liveness";
import { openingAcceptsApplications } from "@/lib/jobs/opening";
import { looksRemote } from "@/lib/jobs/text";
import type { NormalizedJob } from "@/lib/jobs/types";
import { MAX_POST_CHARS } from "@/lib/limits";
import { noticeUrl, type NoticeCode } from "@/lib/notices";
import { createServiceClient, getUser } from "@/lib/supabase/server";

const MATCHES_PER_RUN = 8;

async function requireReadyUser() {
  const { supabase, user } = await getUser();
  if (!supabase || !user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile?.consent_ai_processing_at) redirect("/profile?error=consent");
  return { supabase, user, profile };
}

/**
 * Scores the most promising verified, open jobs against the user's verified profile.
 * Jobs that break one of the user's own hard rules (city, job type, pay, notice period,
 * deal-breakers) are skipped before any AI call, so the AI's attention goes where it's useful.
 */
export async function findMatches() {
  const { supabase, user, profile } = await requireReadyUser();
  const verified = await loadVerifiedProfile(supabase, user.id);
  if (!verified.experiences.length) redirect("/profile?error=noverified");
  const prefs = preferencesOf(profile);

  const [{ data: jobs }, { data: scored }] = await Promise.all([
    supabase
      .from("jobs")
      .select(JOB_FEED_COLUMNS)
      .eq("verification_status", "verified")
      .is("closed_at", null)
      .order("posted_at", { ascending: false })
      .limit(800),
    supabase.from("job_matches").select("job_id, jobs(dedupe_key)").eq("user_id", user.id),
  ]);
  const seenIds = new Set((scored ?? []).map((m) => m.job_id));
  // The same vacancy reposted or listed on two sites is only scored once.
  const seenKeys = new Set(
    (scored ?? []).map((m) => (Array.isArray(m.jobs) ? m.jobs[0] : m.jobs)?.dedupe_key).filter(Boolean),
  );

  const candidates = (jobs ?? [])
    .filter((j) => !seenIds.has(j.id) && !(j.dedupe_key && seenKeys.has(j.dedupe_key)))
    .filter((j) => fitSummary(fitChecks(j, prefs)).blockers === 0)
    .map((j) => ({ job: j, kw: keywordScore(verified, j) }))
    .filter((c) => c.kw > 0)
    .sort((a, b) => b.kw - a.kw)
    .slice(0, MATCHES_PER_RUN);

  if (candidates.length) await requireQuota(supabase, "find_matches", "/jobs");
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
  if (job.verification_status !== "verified") redirect(`/jobs/${jobId}?error=held`);
  if (job.closed_at) redirect(`/jobs/${jobId}?error=closed`);

  // Confirm the job is still up before spending the user's time and an AI call on it.
  if ((await checkStillOpen(job)) === "closed") {
    await createServiceClient()?.from("jobs").update({ closed_at: new Date().toISOString() }).eq("id", jobId);
    revalidatePath("/jobs");
    redirect(`/jobs/${jobId}?error=closed`);
  }

  await requireQuota(supabase, "tailor_cv", `/jobs/${jobId}`);
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

const PLATFORMS = ["linkedin", "instagram", "facebook", "whatsapp", "telegram", "naukri", "x", "other"];

/** Turns a bare email into a mailto: link; leaves URLs alone. */
function applyTarget(link: string | null): string {
  if (!link) return "";
  const trimmed = link.trim();
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(trimmed)) return `mailto:${trimmed}`;
  return trimmed;
}

/**
 * "Bring a job from anywhere." The user pastes a post they found on LinkedIn, Instagram, Facebook,
 * a WhatsApp group, etc. The AI locates the fields, anything not literally in the post is thrown
 * away, and the listing goes through the same verification gate as every other source. It stays
 * private to the user; held listings show exactly what's missing.
 */
export async function submitListing(formData: FormData) {
  const { supabase, user } = await requireReadyUser();
  const fail = (code: NoticeCode) => redirect(noticeUrl("/jobs/add", code));

  const post = String(formData.get("post") ?? "").trim();
  if (post.length < 120) fail("post");
  if (post.length > MAX_POST_CHARS) fail("post_long");
  const seenOn = String(formData.get("seen_on") ?? "other");
  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  const typedLink = String(formData.get("apply_link") ?? "").trim();

  const admin = createServiceClient();
  if (!admin) fail("setup");

  await requireQuota(supabase, "bring_job", "/jobs/add");
  const extracted = await extractListing(post);
  if (!extracted.is_job_post) fail("notjob");

  const job: NormalizedJob = {
    source: "user_submitted",
    external_id: `${user.id}:${createHash("sha256").update(post).digest("hex").slice(0, 24)}`,
    company: extracted.company ?? "",
    title: extracted.title ?? "Untitled role",
    location: extracted.location,
    country_code: null,
    remote: looksRemote(extracted.location, extracted.title),
    description: post,
    // A link the user typed counts only as much as one in the post: it still has to pass the source check.
    apply_url: applyTarget(typedLink || extracted.apply_link),
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    posted_at: new Date().toISOString(),
  };

  const { data: saved, error } = await admin!
    .from("jobs")
    .upsert({
      ...enrichJob(job),
      submitted_by: user.id,
      seen_on: PLATFORMS.includes(seenOn) ? seenOn : "other",
      source_url: /^https:\/\//i.test(sourceUrl) ? sourceUrl.slice(0, 2000) : null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "source,external_id" })
    .select("id")
    .single();
  if (error || !saved) fail("save");

  await logAiAction(admin!, {
    user_id: user.id, action: "extract_listing", model: MODEL, input_ref: saved!.id,
    output_summary: `${extracted.company ?? "no company"} / ${extracted.title ?? "no title"} from ${seenOn}`,
  });
  revalidatePath("/jobs");
  redirect(`/jobs/${saved!.id}?added=1`);
}

const REPORT_REASONS = ["closed", "fake", "wrong_pay", "not_india"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Users flag listings. The database weighs each report by how established the reporter is: enough
 * weight from at least three people pulls the listing, anything less waits for a person to review it
 * (migration 0005). Reporting needs no AI consent, only a sign-in, and only works on listings the
 * reader can see.
 */
export async function reportJob(jobId: string, formData: FormData) {
  const { supabase, user } = await getUser();
  if (!supabase || !user) redirect("/login");
  if (!UUID.test(jobId)) redirect(noticeUrl("/jobs", "report_hidden"));
  const back = `/jobs/${jobId}`;

  const reason = String(formData.get("reason") ?? "");
  if (!REPORT_REASONS.includes(reason)) redirect(back);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const { error } = await supabase.from("job_reports").insert({ job_id: jobId, user_id: user.id, reason, note: note || null });
  if (error) {
    if (error.code === "23505") redirect(`${back}?reported=1`); // already reported: same thanks, nothing changes
    if (error.code === "P0001") redirect(noticeUrl(back, "report_limit"));
    if (error.code === "42501") redirect(noticeUrl("/jobs", "report_hidden")); // not a listing this user can see
    redirect(noticeUrl(back, "report_failed"));
  }
  revalidatePath(back);
  redirect(`${back}?reported=1`);
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
  const back = (code: NoticeCode) => redirect(noticeUrl(`/jobs/${jobId}`, code));

  if (formData.get("consent_share") !== "on" || formData.get("consent_screening") !== "on") {
    back("consent_both");
  }

  const { data: post } = await supabase.from("job_posts").select("id, status").eq("job_id", jobId).maybeSingle();
  if (!post) redirect(`/jobs/${jobId}`);
  // Open is not enough: a listing an operator pulled or held can sit behind a post that still says open.
  const { data: listing } = await supabase.from("jobs").select("verification_status, closed_at").eq("id", jobId).maybeSingle();
  if (!openingAcceptsApplications(post.status, listing)) back("post_closed");

  const { data: application } = await supabase
    .from("applications").select("id").eq("id", applicationId).eq("user_id", user.id).maybeSingle();
  if (!application) redirect(`/jobs/${jobId}`);

  const { data: existing } = await supabase
    .from("post_applications").select("id").eq("job_post_id", post.id).eq("user_id", user.id).maybeSingle();
  if (existing) back("already_applied");

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
  if (error) back("apply_failed");

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
