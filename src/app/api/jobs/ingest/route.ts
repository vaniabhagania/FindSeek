import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { collectJobs } from "@/lib/jobs/ingest";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * Pulls fresh listings into the shared `jobs` table. Called by Vercel Cron
 * (see vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });

  // Search Adzuna for what users actually want.
  const { data: profiles } = await supabase.from("profiles").select("target_roles");
  const queries = [...new Set((profiles ?? []).flatMap((p) => p.target_roles ?? []).map((r: string) => r.toLowerCase()))];

  const { jobs, errors } = await collectJobs(queries);
  let saved = 0;
  for (let i = 0; i < jobs.length; i += 500) {
    const batch = jobs.slice(i, i + 500).map((j) => ({ ...j, fetched_at: new Date().toISOString() }));
    const { error } = await supabase.from("jobs").upsert(batch, { onConflict: "source,external_id" });
    if (error) errors.push(error.message);
    else saved += batch.length;
  }
  return NextResponse.json({ fetched: jobs.length, saved, errors });
}
