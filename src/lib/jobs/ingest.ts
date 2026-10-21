import { env } from "@/lib/env";
import { searchAdzuna } from "./adzuna";
import { greenhouseBoards, leverSites } from "./boards";
import { collapseDuplicates } from "./dedupe";
import { enrichJob, type EnrichedJob } from "./enrich";
import { fetchGreenhouseBoard } from "./greenhouse";
import { fetchLeverSite } from "./lever";
import type { JobSource, NormalizedJob } from "./types";

export interface IngestResult {
  jobs: (EnrichedJob & { dedupe_key: string })[];
  errors: string[];
  /**
   * Company boards fetched in full this run. A listing from one of these that wasn't in the
   * response has been taken down by the employer, so it can be closed with confidence.
   */
  completeBoards: { source: JobSource; prefix: string }[];
}

/**
 * Pulls listings from every configured source. `queries` are role keywords
 * (e.g. the distinct target roles across all users) used for Adzuna search.
 */
export async function collectJobs(queries: string[]): Promise<IngestResult> {
  const boards = [
    ...greenhouseBoards().map((b) => ({ source: "greenhouse" as const, prefix: `${b.token}:`, run: () => fetchGreenhouseBoard(b.token, b.company) })),
    ...leverSites().map((s) => ({ source: "lever" as const, prefix: `${s.site}:`, run: () => fetchLeverSite(s.site, s.company) })),
  ];
  // Keep Adzuna usage well inside the free-tier monthly quota.
  const searches = env.jobCountries.flatMap((country) => queries.slice(0, 8).map((q) => () => searchAdzuna(country, q)));

  const [boardResults, searchResults] = await Promise.all([
    Promise.allSettled(boards.map((b) => b.run())),
    Promise.allSettled(searches.map((s) => s())),
  ]);

  const raw: NormalizedJob[] = [];
  const errors: string[] = [];
  const completeBoards: IngestResult["completeBoards"] = [];
  boardResults.forEach((result, i) => {
    if (result.status === "rejected") errors.push(reason(result.reason));
    else {
      completeBoards.push({ source: boards[i].source, prefix: boards[i].prefix });
      raw.push(...result.value);
    }
  });
  for (const result of searchResults) {
    if (result.status === "rejected") errors.push(reason(result.reason));
    else raw.push(...result.value);
  }

  const usable = raw.filter((j) => j.description && j.apply_url);
  // Score duplicates on the raw listing, then enrich only the copy we keep.
  const unique = collapseDuplicates(usable);
  return { jobs: unique.map((j) => ({ ...enrichJob(j), dedupe_key: j.dedupe_key })), errors, completeBoards };
}

const reason = (r: unknown) => String(r instanceof Error ? r.message : r);
