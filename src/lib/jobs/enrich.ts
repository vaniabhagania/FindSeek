// Turns a raw listing into the row stored in `jobs`: verification result plus the facts
// users filter on (city, work mode, job type, experience, notice period, pay in INR).

import { indianCitiesIn, indiaEligibility, workModeOf } from "@/lib/india/location";
import { parseExperience, parseJobType, parseNoticeLimit } from "@/lib/india/requirements";
import { dedupeKey } from "./dedupe";
import { scamFlags } from "./scam";
import type { NormalizedJob } from "./types";
import { verifyListing } from "./verify";

export function enrichJob(job: NormalizedJob) {
  const v = verifyListing(job);
  const text = `${job.title}\n${job.description}`;
  const exp = parseExperience(text);
  const elig = indiaEligibility(job);
  return {
    ...job,
    scam_flags: scamFlags(job),
    dedupe_key: dedupeKey(job),
    verification_status: v.status,
    verification_checks: v.checks,
    verified_at: v.status === "verified" ? new Date().toISOString() : null,
    india_eligibility: elig.status,
    cities: indianCitiesIn(job.location),
    work_mode: workModeOf(job.location, job.description, job.remote),
    job_type: parseJobType(job.title, job.description),
    experience_min: exp?.min ?? null,
    experience_max: exp?.max ?? null,
    notice_max_days: parseNoticeLimit(job.description),
    pay_min_inr: v.pay ? Math.round(v.pay.minAnnualInr) : null,
    pay_max_inr: v.pay ? Math.round(v.pay.maxAnnualInr) : null,
    pay_period: v.pay?.period ?? null,
    pay_text: v.pay?.source ?? null,
  };
}

export type EnrichedJob = ReturnType<typeof enrichJob>;
