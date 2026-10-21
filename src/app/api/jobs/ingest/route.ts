import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { collectJobs } from "@/lib/jobs/ingest";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Pulls fresh listings into the shared `jobs` table, verifies each one, and closes listings
 * that have disappeared from their source. Called by Vercel Cron (see vercel.json), which
 * sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });

  // Search for what users actually want, including internships for anyone who asked for them.
  const { data: profiles } = await supabase.from("profiles").select("target_roles, job_types");
  const roles = new Set<string>();
  for (const p of profiles ?? []) {
    for (const r of (p.target_roles ?? []) as string[]) {
      roles.add(r.toLowerCase());
      if ((p.job_types ?? []).includes("internship") && !/intern/i.test(r)) roles.add(`${r.toLowerCase()} intern`);
    }
  }

  const runStartedAt = new Date().toISOString();
  const { jobs, errors, completeBoards } = await collectJobs([...roles]);

  let saved = 0;
  for (let i = 0; i < jobs.length; i += 500) {
    const batch = jobs.slice(i, i + 500).map((j) => ({ ...j, fetched_at: runStartedAt, last_seen_at: runStartedAt, closed_at: null }));
    const { error } = await supabase.from("jobs").upsert(batch, { onConflict: "source,external_id" });
    if (error) errors.push(error.message);
    else saved += batch.length;
  }

  // A full board fetch is authoritative: anything from that board we didn't see is closed.
  let closed = 0;
  for (const board of completeBoards) {
    const { count, error } = await supabase
      .from("jobs")
      .update({ closed_at: runStartedAt }, { count: "exact" })
      .eq("source", board.source)
      .like("external_id", `${board.prefix}%`)
      .lt("last_seen_at", runStartedAt)
      .is("closed_at", null);
    if (error) errors.push(error.message);
    closed += count ?? 0;
  }
  // Search results aren't exhaustive, so aggregator listings close only after a week unseen.
  const { count: expired } = await supabase
    .from("jobs")
    .update({ closed_at: runStartedAt }, { count: "exact" })
    .eq("source", "adzuna")
    .lt("last_seen_at", new Date(Date.now() - 7 * DAY).toISOString())
    .is("closed_at", null);

  const verified = jobs.filter((j) => j.verification_status === "verified").length;
  return NextResponse.json({
    fetched: jobs.length,
    saved,
    verified,
    held: jobs.length - verified,
    closed: closed + (expired ?? 0),
    errors,
  });
}
