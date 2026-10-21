// Personal fit: checks a verified listing against what this user said they need. Each
// check is a plain sentence, so the feed can say *why* a job is or isn't right for them
// instead of hiding the reasoning inside one score.

import { formatInr } from "@/lib/india/pay";

export interface Preferences {
  career_stage: "student" | "fresher" | "experienced" | null;
  experience_years: number | null;
  preferred_cities: string[];
  open_to_relocate: boolean;
  remote_preference: "remote" | "hybrid" | "onsite" | "any" | null;
  job_types: string[];
  expected_pay_min_inr: number | null;
  notice_period_days: number | null;
  deal_breakers: string[];
}

export interface FitJob {
  cities: string[];
  location: string | null;
  work_mode: "remote" | "hybrid" | "onsite" | null;
  job_type: string | null;
  experience_min: number | null;
  experience_max: number | null;
  notice_max_days: number | null;
  pay_min_inr: number | null;
  pay_max_inr: number | null;
  pay_period: "year" | "month" | null;
  description: string;
  title: string;
}

export type FitLevel = "good" | "caution" | "blocker";
export interface FitCheck { key: string; level: FitLevel; text: string }

const JOB_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time", internship: "Internship", part_time: "Part-time", contract: "Contract", apprenticeship: "Apprenticeship",
};

// Common ways ads phrase the things people most often rule out.
const DEAL_BREAKER_PATTERNS: { match: RegExp; find: RegExp; label: string }[] = [
  { match: /bond/i, find: /\b(service bond|bond period|employment bond|bond of|sign(ing)? a bond|service agreement)\b/i, label: "Mentions a service bond" },
  { match: /night|shift/i, find: /\b(night shifts?|rotational shifts?|us shift|uk shift|graveyard shift)\b/i, label: "Mentions night or rotational shifts" },
  { match: /sales|target/i, find: /\b(sales targets?|monthly targets?|quota|cold calling)\b/i, label: "Has sales targets" },
  { match: /travel/i, find: /\b(\d{2}%\s*travel|extensive travel|travel (required|extensively))\b/i, label: "Needs regular travel" },
  { match: /weekend|6 day|six day/i, find: /\b(6|six)[- ]days? (a )?week|weekend work|work(ing)? on (saturdays|weekends)\b/i, label: "Six-day weeks or weekend work" },
  { match: /unpaid/i, find: /\b(unpaid|no stipend)\b/i, label: "Unpaid" },
];

function dealBreakerHits(breakers: string[], text: string): string[] {
  const hits: string[] = [];
  for (const raw of breakers) {
    const phrase = raw.trim();
    if (phrase.length < 3) continue;
    const known = DEAL_BREAKER_PATTERNS.find((p) => p.match.test(phrase));
    if (known) {
      if (known.find.test(text)) hits.push(known.label);
      continue;
    }
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) hits.push(`Mentions "${phrase}"`);
  }
  return [...new Set(hits)];
}

export function fitChecks(job: FitJob, prefs: Preferences): FitCheck[] {
  const checks: FitCheck[] = [];
  const text = `${job.title}\n${job.description}`;

  // Where
  const remote = job.work_mode === "remote";
  if (prefs.preferred_cities.length) {
    const inCity = job.cities.filter((c) => prefs.preferred_cities.includes(c));
    if (inCity.length) checks.push({ key: "city", level: "good", text: `In ${inCity.join(" or ")}` });
    else if (remote) checks.push({ key: "city", level: "good", text: "Remote within India" });
    else if (job.cities.length) {
      checks.push(prefs.open_to_relocate
        ? { key: "city", level: "caution", text: `In ${job.cities.join(", ")}; you'd relocate` }
        : { key: "city", level: "blocker", text: `In ${job.cities.join(", ")}, not one of your cities` });
    }
  }

  // How
  const want = prefs.remote_preference ?? "any";
  if (job.work_mode && want !== "any" && job.work_mode !== want) {
    const strict = want === "remote" && job.work_mode === "onsite";
    checks.push({ key: "mode", level: strict ? "blocker" : "caution", text: `${cap(job.work_mode)}; you prefer ${want}` });
  } else if (job.work_mode && want !== "any") {
    checks.push({ key: "mode", level: "good", text: cap(job.work_mode) });
  }

  // What kind of job
  if (job.job_type && prefs.job_types.length && !prefs.job_types.includes(job.job_type)) {
    checks.push({ key: "type", level: "blocker", text: `${JOB_TYPE_LABEL[job.job_type] ?? job.job_type}, which you didn't ask for` });
  }

  // Pay
  const expected = prefs.expected_pay_min_inr;
  if (expected && job.pay_max_inr != null) {
    const period = job.pay_period ?? "year";
    const offered = `${formatInr(job.pay_max_inr, period)}`;
    const wanted = formatInr(expected, period);
    if (job.pay_max_inr < expected) checks.push({ key: "pay", level: "blocker", text: `Pays up to ${offered}; you want ${wanted}` });
    else if ((job.pay_min_inr ?? job.pay_max_inr) >= expected) checks.push({ key: "pay", level: "good", text: `Pays at least ${formatInr(job.pay_min_inr ?? job.pay_max_inr, period)}` });
    else checks.push({ key: "pay", level: "caution", text: `Pay range reaches ${offered}; negotiate for ${wanted}+` });
  }

  // Experience
  const years = prefs.experience_years ?? (prefs.career_stage && prefs.career_stage !== "experienced" ? 0 : null);
  if (years != null && job.experience_min != null) {
    if (job.experience_min > years + 1) {
      checks.push({ key: "experience", level: "blocker", text: `Asks for ${job.experience_min}+ years; you have ${fmtYears(years)}` });
    } else if (job.experience_max != null && job.experience_max + 3 < years) {
      checks.push({ key: "experience", level: "caution", text: `Aimed at ${job.experience_min}–${job.experience_max} years; may be too junior for you` });
    } else {
      checks.push({ key: "experience", level: "good", text: "Matches your experience" });
    }
  }

  // Notice period
  if (prefs.notice_period_days != null && job.notice_max_days != null && prefs.notice_period_days > job.notice_max_days) {
    checks.push({
      key: "notice",
      level: "blocker",
      text: job.notice_max_days === 0
        ? `Wants immediate joiners; your notice is ${prefs.notice_period_days} days`
        : `Wants joining within ${job.notice_max_days} days; your notice is ${prefs.notice_period_days}`,
    });
  }

  // Deal-breakers the user named
  for (const hit of dealBreakerHits(prefs.deal_breakers, text)) checks.push({ key: "dealbreaker", level: "blocker", text: hit });

  return checks;
}

export function fitSummary(checks: FitCheck[]) {
  return {
    blockers: checks.filter((c) => c.level === "blocker").length,
    cautions: checks.filter((c) => c.level === "caution").length,
  };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const fmtYears = (y: number) => (y === 0 ? "none yet" : `${y} year${y === 1 ? "" : "s"}`);
