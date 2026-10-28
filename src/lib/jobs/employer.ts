// Who is behind an employer's own opening? Anyone can create an employer account and call it
// "Infosys". The opening is trusted as that company's only when the account is tied to it: it signs in
// with an email on the company's own domain, or an operator has vouched for the domain, or the account
// is a FindSeek operator's own.

import { belongsToCompany, companyTokens, isFreeHosting, isPersonalEmail, registered } from "./domains";

export interface EmployerIdentity {
  /** The confirmed sign-in email of the account that is posting. */
  email: string | null | undefined;
  /** FindSeek operators (OPERATOR_EMAILS). */
  operators: string[];
  /** Registrable domains an operator has vetted for employers whose domain differs from their name (TRUSTED_EMPLOYER_DOMAINS). */
  trustedDomains: string[];
}

export interface EmployerTrust { ok: boolean; detail: string }

export function employerTrust(company: string, who: EmployerIdentity | null | undefined): EmployerTrust {
  const email = who?.email?.trim().toLowerCase() ?? "";
  if (!who || !email.includes("@")) {
    return { ok: false, detail: "The employer account has no confirmed email, so it can't be tied to the company" };
  }
  if (who.operators.includes(email)) return { ok: true, detail: "Posted by a FindSeek operator account" };

  const host = email.split("@")[1] ?? "";
  if (isPersonalEmail(email)) {
    return { ok: false, detail: `The employer account signs in with a personal email (${host}); publish from a work email at ${company}'s own domain` };
  }
  const reg = registered(host);
  if (!reg || isFreeHosting(host)) {
    return { ok: false, detail: `The employer account's email domain (${host || "none"}) can't be tied to ${company}` };
  }
  if (who.trustedDomains.includes(reg.domain)) {
    return { ok: true, detail: `Posted from ${reg.domain}, an employer domain FindSeek has vetted` };
  }
  if (belongsToCompany(company, companyTokens(company), host)) {
    return { ok: true, detail: `Posted from the company's own email domain (${reg.domain})` };
  }
  return { ok: false, detail: `The employer account's email domain (${reg.domain}) isn't ${company}'s own domain` };
}

/** TRUSTED_EMPLOYER_DOMAINS: "acmetech.in, beta.co.in". Anything that isn't a plain domain is ignored. */
export function parseTrustedDomains(raw: string | undefined | null): string[] {
  const out: string[] = [];
  for (const entry of (raw ?? "").split(",")) {
    const host = entry.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0];
    const reg = host && !isPersonalEmail(`x@${host}`) && !isFreeHosting(host) ? registered(host) : null;
    if (reg && !out.includes(reg.domain)) out.push(reg.domain);
  }
  return out;
}
