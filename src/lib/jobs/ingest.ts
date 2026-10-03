import { env } from "@/lib/env";
import { searchAdzuna } from "./adzuna";
import { GREENHOUSE_BOARDS, LEVER_SITES } from "./boards";
import { fetchGreenhouseBoard } from "./greenhouse";
import { fetchLeverSite } from "./lever";
import { scamFlags } from "./scam";
import type { NormalizedJob } from "./types";

export interface IngestResult {
  jobs: (NormalizedJob & { scam_flags: string[] })[];
  errors: string[];
}

/**
 * Pulls listings from every configured source. `queries` are role keywords
 * (e.g. the distinct target roles across all users) used for Adzuna search.
 */
export async function collectJobs(queries: string[]): Promise<IngestResult> {
  const tasks: Promise<NormalizedJob[]>[] = [
    ...GREENHOUSE_BOARDS.map((b) => fetchGreenhouseBoard(b.token, b.company)),
    ...LEVER_SITES.map((s) => fetchLeverSite(s.site, s.company)),
    // Keep Adzuna usage well inside the free-tier monthly quota.
    ...env.jobCountries.flatMap((country) => queries.slice(0, 5).map((q) => searchAdzuna(country, q))),
  ];

  const settled = await Promise.allSettled(tasks);
  const jobs: IngestResult["jobs"] = [];
  const errors: string[] = [];
  for (const result of settled) {
    if (result.status === "rejected") {
      errors.push(String(result.reason instanceof Error ? result.reason.message : result.reason));
      continue;
    }
    for (const job of result.value) {
      if (!job.description || !job.apply_url) continue;
      jobs.push({ ...job, scam_flags: scamFlags(job) });
    }
  }
  return { jobs, errors };
}
