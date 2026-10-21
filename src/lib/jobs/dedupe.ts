// The same vacancy often appears on the company board, Adzuna and a reposted LinkedIn ad.
// Each copy gets the same key so users see it once, and reposts can be counted.

import { indianCitiesIn } from "@/lib/india/location";
import { companyTokens } from "./verify";
import type { JobSource } from "./types";

const TITLE_NOISE = /\b(urgent(ly)?|hiring|immediate|opening|vacancy|wfh|remote|hybrid|on-?site|full[- ]time)\b/g;

export function dedupeKey(job: { company: string; title: string; location: string | null }): string {
  const company = companyTokens(job.company).join("-") || job.company.toLowerCase().trim();
  const title = job.title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ") // "(Remote)", "[Bengaluru]"
    .replace(/\s[-–|]\s.*$/, " ") // "Backend Engineer - Bangalore"
    .replace(TITLE_NOISE, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
  const city = indianCitiesIn(job.location)[0]?.toLowerCase() ?? (/\bremote\b/i.test(job.location ?? "") ? "remote" : "any");
  return `${company}|${title}|${city}`;
}

// Prefer the copy published by the employer itself over an aggregator's copy.
const SOURCE_RANK: Record<JobSource, number> = { manual: 0, greenhouse: 1, lever: 1, user_submitted: 2, adzuna: 3 };

/** Keeps one listing per key: the most direct source, then the longest description. */
export function collapseDuplicates<T extends { source: JobSource; description: string; company: string; title: string; location: string | null }>(
  jobs: T[],
): (T & { dedupe_key: string })[] {
  const best = new Map<string, T & { dedupe_key: string }>();
  for (const job of jobs) {
    const key = dedupeKey(job);
    const current = best.get(key);
    const better =
      !current ||
      SOURCE_RANK[job.source] < SOURCE_RANK[current.source] ||
      (SOURCE_RANK[job.source] === SOURCE_RANK[current.source] && job.description.length > current.description.length);
    if (better) best.set(key, { ...job, dedupe_key: key });
  }
  return [...best.values()];
}
