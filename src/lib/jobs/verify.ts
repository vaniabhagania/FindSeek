// The verification gate. A listing only reaches a user's feed when every check passes:
// a real hiring source, a proper description with qualifications, stated pay, no scam
// signals, and open to someone living in India. Failing listings are held back with the
// reasons recorded, never silently dropped and never silently shown.

import { indiaEligibility } from "@/lib/india/location";
import { parsePay, payFromFields, type Pay } from "@/lib/india/pay";
import { statesQualifications } from "@/lib/india/requirements";
import { belongsToCompany, companyTokens, isFreeHosting, isPersonalEmail, registered } from "./domains";
import { employerTrust, type EmployerIdentity } from "./employer";
import { scamFlags } from "./scam";
import type { JobSource } from "./types";

export interface VerifiableJob {
  source: JobSource;
  company: string;
  title: string;
  location: string | null;
  country_code: string | null;
  description: string;
  apply_url: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
}

export type CheckKey = "source" | "description" | "qualifications" | "pay" | "safety" | "india";

export interface Check { key: CheckKey; label: string; ok: boolean; detail: string }

export interface Verification {
  status: "verified" | "held";
  checks: Check[];
  pay: Pay | null;
  /** Pay in a non-INR currency, e.g. a global remote role paying in USD. */
  foreignPay: { min: number | null; max: number | null; currency: string } | null;
}

// Applicant tracking systems and job sites where the employer itself publishes the ad.
const TRUSTED_HOSTS = [
  "greenhouse.io", "lever.co", "myworkdayjobs.com", "workday.com", "smartrecruiters.com", "ashbyhq.com",
  "keka.com", "darwinbox.in", "darwinbox.com", "zohorecruit.in", "zohorecruit.com", "freshteam.com",
  "recruitee.com", "workable.com", "bamboohr.com", "teamtailor.com", "jobvite.com", "icims.com",
  "successfactors.com", "taleo.net", "oraclecloud.com", "naukri.com", "instahyre.com", "cutshort.io",
  "wellfound.com", "internshala.com", "unstop.com", "iimjobs.com", "hirist.tech", "foundit.in",
  "ncs.gov.in", "apprenticeshipindia.gov.in", "adzuna.in", "adzuna.com",
];
// A LinkedIn job listing is published by a company page; a feed post is not.
const LINKEDIN_JOB = /^https:\/\/(www\.|in\.)?linkedin\.com\/jobs\/view\//i;

// Places a post can point to that don't identify an employer at all.
const UNVERIFIABLE: { re: RegExp; why: string }[] = [
  { re: /(^|\.)(wa\.me|whatsapp\.com|chat\.whatsapp\.com)$/i, why: "a WhatsApp chat" },
  { re: /(^|\.)(t\.me|telegram\.me|telegram\.org)$/i, why: "a Telegram chat" },
  { re: /(^|\.)(bit\.ly|tinyurl\.com|cutt\.ly|rb\.gy|shorturl\.at|t\.co|goo\.gl)$/i, why: "a link shortener that hides the destination" },
  { re: /(^|\.)(forms\.gle)$|^docs\.google\.com$/i, why: "a Google Form, which anyone can create" },
  { re: /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|x\.com|twitter\.com)$/i, why: "a social media post rather than the employer's application page" },
  { re: /(^|\.)linkedin\.com$/i, why: "a LinkedIn post rather than a LinkedIn job listing" },
];

// Kept here so existing imports of companyTokens from "./verify" keep working.
export { companyTokens };

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/** What the check cannot learn from the listing itself. */
export interface VerifyContext {
  /** Who posted an employer's own opening. Without it such an opening cannot be verified. */
  employer?: EmployerIdentity;
}

export function checkHiringSource(job: Pick<VerifiableJob, "source" | "company" | "apply_url" | "description">, context: VerifyContext = {}): Check {
  const label = "Real hiring source";
  if (!job.company || /^unknown/i.test(job.company)) return { key: "source", label, ok: false, detail: "No employer named" };
  if (job.source === "manual") {
    // Anyone can create an employer account and call it anything. Being on FindSeek proves nothing:
    // the account has to be tied to the company it posts for.
    const trust = employerTrust(job.company, context.employer);
    return { key: "source", label, ok: trust.ok, detail: trust.detail };
  }

  const emailMatch = job.apply_url.match(/^mailto:([^?]+)/i);
  if (emailMatch) {
    let raw = emailMatch[1];
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* keep it as written */
    }
    const addresses = raw.split(/[,;]/).map((a) => a.trim()).filter(Boolean);
    if (!addresses.length) return { key: "source", label, ok: false, detail: "No application email given" };
    const tokens = companyTokens(job.company);
    // Every address must be the company's own; one stray recipient is enough to fail.
    for (const email of addresses) {
      if (isPersonalEmail(email)) return { key: "source", label, ok: false, detail: `Applications go to a personal email (${email})` };
      const domain = email.split("@")[1]?.toLowerCase() ?? "";
      if (!email.includes("@") || !belongsToCompany(job.company, tokens, domain)) {
        return { key: "source", label, ok: false, detail: `Email domain ${domain || email} isn't ${job.company}'s own domain` };
      }
    }
    const domain = addresses[0].split("@")[1].toLowerCase();
    return { key: "source", label, ok: true, detail: `Applications go to the company's own email domain (${registered(domain)?.domain ?? domain})` };
  }

  const host = hostOf(job.apply_url);
  if (!host) return { key: "source", label, ok: false, detail: "Application link is missing or not a secure https link" };
  if (LINKEDIN_JOB.test(job.apply_url)) return { key: "source", label, ok: true, detail: "LinkedIn job listing published by a company page" };
  const bad = UNVERIFIABLE.find((u) => u.re.test(host));
  if (bad) return { key: "source", label, ok: false, detail: `The application link is ${bad.why}` };
  if (isFreeHosting(host)) {
    return { key: "source", label, ok: false, detail: `${host} is a free website or page builder where anyone can publish under any name` };
  }
  if (TRUSTED_HOSTS.some((t) => host === t || host.endsWith(`.${t}`))) {
    return { key: "source", label, ok: true, detail: `Published on ${host}` };
  }
  if (belongsToCompany(job.company, companyTokens(job.company), host)) {
    return { key: "source", label, ok: true, detail: `Published on the company's own site (${registered(host)?.domain ?? host})` };
  }
  return { key: "source", label, ok: false, detail: `${host} isn't ${job.company}'s website or a known hiring platform` };
}

export function verifyListing(job: VerifiableJob, context: VerifyContext = {}): Verification {
  const text = `${job.title}\n${job.description}`;
  const checks: Check[] = [checkHiringSource(job, context)];

  const words = job.description.trim().split(/\s+/).filter(Boolean).length;
  checks.push(
    words >= 80
      ? { key: "description", label: "Full job description", ok: true, detail: `${words} words` }
      : { key: "description", label: "Full job description", ok: false, detail: `Only ${words} words; too short to judge the role` },
  );

  const quals = statesQualifications(job.description);
  checks.push({ key: "qualifications", label: "Qualifications stated", ok: quals.ok, detail: quals.detail });

  const pay = payFromFields(job.salary_min, job.salary_max, job.salary_currency) ?? parsePay(text);
  const foreignPay =
    !pay && job.salary_currency && job.salary_currency.toUpperCase() !== "INR" && (job.salary_min || job.salary_max)
      ? { min: job.salary_min, max: job.salary_max, currency: job.salary_currency.toUpperCase() }
      : null;
  checks.push(
    pay
      ? { key: "pay", label: "Pay stated", ok: true, detail: pay.unpaid ? "States the role is unpaid" : `From "${pay.source}"` }
      : foreignPay
        ? { key: "pay", label: "Pay stated", ok: true, detail: `Paid in ${foreignPay.currency}` }
        : { key: "pay", label: "Pay stated", ok: false, detail: "No salary, CTC or stipend given" },
  );

  const flags = scamFlags(job);
  checks.push(
    flags.length
      ? { key: "safety", label: "No scam signals", ok: false, detail: flags.join("; ") }
      : { key: "safety", label: "No scam signals", ok: true, detail: "None of the known warning signs" },
  );

  const elig = indiaEligibility(job);
  checks.push({ key: "india", label: "Open to candidates in India", ok: elig.status === "eligible", detail: elig.reason });

  return { status: checks.every((c) => c.ok) ? "verified" : "held", checks, pay, foreignPay };
}
