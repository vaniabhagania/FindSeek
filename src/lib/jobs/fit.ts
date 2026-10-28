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

// ---------------------------------------------------------------------------
// "There is no service bond" is not a service bond.
// ---------------------------------------------------------------------------
// A deal-breaker the user named must not fire on an ad that says the thing does not apply. The check
// reads only the clause the mention sits in, and only the few words next to it (six), so a denial of one
// thing ("No service bond, but night shifts apply") never hides another. Missing a real deal-breaker
// costs the user more than showing a spurious one, so when in doubt it still fires.

const CLAUSE_BREAK = /[.!?\n;:,()]|\b(?:but|however|although|though|except|while|whereas|yet)\b/;
const NEGATION = /\b(?:no|not|never|nor|without|zero|nil|neither|cannot|can't|don't|doesn't|won't|isn't|aren't)\b|\bfree of\b/;
const DENIAL_AFTER =
  /^\s*(?:(?:is|are|will be|shall be)\s+)?(?:[:=\-–]\s*)?(?:nil|none|zero|waived|absent|n\/a|not\s+(?:required|applicable|applied|needed|mandatory|there|present|charged))\b|^[-\s]*free\b/;

/** Is this mention the ad saying the thing does NOT apply? `text` is lower-case. */
function isDenied(text: string, start: number, end: number): boolean {
  const clause = text.slice(Math.max(0, start - 80), start).split(CLAUSE_BREAK).pop() ?? "";
  const nearest = clause.trim().split(/\s+/).filter(Boolean).slice(-6).join(" ");
  if (NEGATION.test(nearest)) return true;
  return DENIAL_AFTER.test(text.slice(end, end + 40));
}

/** Does the text mention `re` anywhere other than to say it does not apply? */
function mentionsAffirmatively(re: RegExp, text: string): boolean {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(global)) {
    if (!isDenied(text, m.index, m.index + m[0].length)) return true;
  }
  return false;
}

function dealBreakerHits(breakers: string[], rawText: string): string[] {
  const text = rawText.toLowerCase().replace(/[’‘`´]/g, "'");
  const hits: string[] = [];
  for (const raw of breakers) {
    const phrase = raw.trim();
    if (phrase.length < 3) continue;
    const known = DEAL_BREAKER_PATTERNS.find((p) => p.match.test(phrase));
    if (known) {
      if (mentionsAffirmatively(known.find, text)) hits.push(known.label);
      continue;
    }
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (mentionsAffirmatively(re, text)) hits.push(`Mentions "${phrase}"`);
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
