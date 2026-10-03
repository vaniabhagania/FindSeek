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

export async function setApplicationStatus(applicationId: string, formData: FormData) {
  const { supabase } = await requireReadyUser();
  const status = String(formData.get("status"));
  // "applied" is only reachable through markApplied (approval + monthly cap).
  const allowed = ["saved", "ready", "interview", "offer", "rejected", "withdrawn"];
  if (!allowed.includes(status)) return;
  await supabase.from("applications").update({ status }).eq("id", applicationId);
  revalidatePath("/tracker");
}
