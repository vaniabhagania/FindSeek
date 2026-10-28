// The same vacancy often appears on the company board, Adzuna and a reposted LinkedIn ad.
// Each copy gets the same key so users see it once, and reposts can be counted.

import { INDIAN_CITIES, INDIAN_STATES, indianCitiesIn } from "@/lib/india/location";
import { MAX_TITLE_CHARS } from "@/lib/limits";
import { companyTokens } from "./domains";
import type { JobSource } from "./types";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Words that describe where or how a vacancy is listed, not which vacancy it is. Longest first so
// "navi mumbai" is removed before "mumbai".
const LOCATION_WORDS = [...Object.values(INDIAN_CITIES).flat(), ...INDIAN_STATES, "india", "pan india", "bharat"]
  .sort((x, y) => y.length - x.length)
  .map(escape)
  .join("|");
const LOCATION = new RegExp(`\\b(?:${LOCATION_WORDS})\\b`, "g");
const NOISE =
  /\b(?:urgent(?:ly)?|hiring|immediate(?:ly)?|joiners?|opening|openings|vacancy|wfh|remote|hybrid|on-?site|work from (?:home|office)|full[- ]time|apply now|walk[- ]in)\b/g;

/** A bracketed part that only says where or how a vacancy is listed, with nothing about the role itself. */
const disposable = (part: string) => part.toLowerCase().replace(LOCATION, " ").replace(NOISE, " ").replace(/[^a-z0-9]+/g, "") === "";

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5" };

/**
 * What the role is, with where and how it is listed taken out. Levels ("II", "Level 2") and teams
 * ("- Payments") stay: they are different vacancies, and merging them would hide one from the user.
 */
function titleCore(title: string, company: string): string {
  const withoutBrackets = title
    .slice(0, MAX_TITLE_CHARS)
    .toLowerCase()
    .replace(/[(\[]([^)\]]*)[)\]]/g, (_m, inner: string) => (disposable(inner) ? " " : ` ${inner} `));
  const withoutCompany = companyTokens(company).reduce((t, tok) => t.replace(new RegExp(`\\b${escape(tok)}\\b`, "g"), " "), withoutBrackets);
  const words = withoutCompany
    .replace(LOCATION, " ")
    .replace(NOISE, " ")
    .replace(/\blevel\s+(?=\d)/g, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i, all) => (i === all.length - 1 && ROMAN[w] ? ROMAN[w] : w));
  return words.join("-");
}

export function dedupeKey(job: { company: string; title: string; location: string | null }): string {
  const company = companyTokens(job.company).join("-") || job.company.toLowerCase().trim();
  const city = indianCitiesIn(job.location)[0]?.toLowerCase() ?? (/\bremote\b/i.test(job.location ?? "") ? "remote" : "any");
  return `${company}|${titleCore(job.title, job.company)}|${city}`;
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
