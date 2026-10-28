import { describe, expect, it } from "vitest";
import { employerTrust, parseTrustedDomains } from "./employer";
import { enrichJob } from "./enrich";
import { checkHiringSource } from "./verify";
import type { NormalizedJob } from "./types";

const who = (email: string | null, extra: { operators?: string[]; trustedDomains?: string[] } = {}) => ({
  email,
  operators: extra.operators ?? [],
  trustedDomains: extra.trustedDomains ?? [],
});

describe("employerTrust: an employer account must be tied to the company it posts for", () => {
  it.each([
    ["Razorpay Software Pvt Ltd", "priya@razorpay.com"],
    ["Razorpay", "priya@razorpay.co.in"],
    ["Razorpay", "priya@careers.razorpay.com"],
    ["Acme Technologies", "r@acme.in"],
    ["Tata Consultancy Services", "hr@tcs.com"],
  ])("%s posting from %s passes", (company, email) => {
    expect(employerTrust(company, who(email)).ok).toBe(true);
  });

  it.each([
    ["Infosys", "anyone@gmail.com", "personal email"],
    ["Razorpay", "priya@yahoo.co.in", "personal email"],
    ["Razorpay", "priya@razorpay-hiring.xyz", "isn't"],
    ["Razorpay", "priya@razorpay.co", "isn't"],
    ["Razorpay", "priya@razorpay.careers-portal.top", "isn't"],
    ["Infosys", "recruiter@acmetech.in", "isn't"],
    ["Infosys", "x@infosys.com.verify-offer.in", "isn't"],
    ["Google", "x@notgoogle.com", "isn't"],
  ])("%s posting from %s fails (%s)", (company, email, why) => {
    const t = employerTrust(company, who(email));
    expect(t.ok).toBe(false);
    expect(t.detail).toContain(why);
  });

  it("fails when the account has no email, or no identity was supplied at all", () => {
    expect(employerTrust("Acme", who(null)).ok).toBe(false);
    expect(employerTrust("Acme", who("")).ok).toBe(false);
    expect(employerTrust("Acme", undefined).ok).toBe(false);
  });

  it("does not print the whole address in its reason, only the domain", () => {
    expect(employerTrust("Infosys", who("someone.private@acmetech.in")).detail).not.toContain("someone.private");
  });

  it("lets a FindSeek operator's own account post, whatever the domain (exact match, any case)", () => {
    expect(employerTrust("Acme", who("Vania@Gmail.com", { operators: ["vania@gmail.com"] })).ok).toBe(true);
    expect(employerTrust("Acme", who("vania2@gmail.com", { operators: ["vania@gmail.com"] })).ok).toBe(false);
  });

  it("accepts a domain an operator has vetted, including its subdomains, for any company name", () => {
    const trusted = { trustedDomains: ["acmetech.in"] };
    expect(employerTrust("Acme Technologies", who("r@acmetech.in", trusted)).ok).toBe(true);
    expect(employerTrust("Acme Technologies", who("r@mail.acmetech.in", trusted)).ok).toBe(true);
    // the list vouches for that domain only
    expect(employerTrust("Acme Technologies", who("r@acmetech.com", trusted)).ok).toBe(false);
    expect(employerTrust("Acme Technologies", who("r@evil-acmetech.in", trusted)).ok).toBe(false);
  });

  it("never trusts a free-mail or free-hosting domain even if it is on the vetted list", () => {
    expect(employerTrust("Acme", who("r@gmail.com", { trustedDomains: ["gmail.com"] })).ok).toBe(false);
    expect(employerTrust("Acme", who("r@acme.github.io", { trustedDomains: ["github.io"] })).ok).toBe(false);
  });
});

describe("parseTrustedDomains", () => {
  it("keeps the registered domain of each valid entry", () => {
    expect(parseTrustedDomains("acmetech.in, Mail.Beta.CO.IN ,https://gamma.com/path, not a domain, ,delta")).toEqual([
      "acmetech.in", "beta.co.in", "gamma.com",
    ]);
  });
  it("is empty for nothing", () => {
    expect(parseTrustedDomains("")).toEqual([]);
    expect(parseTrustedDomains(undefined)).toEqual([]);
  });
});

const listing = (over: Partial<NormalizedJob> = {}): NormalizedJob => ({
  source: "manual",
  external_id: "p1",
  company: "Infosys",
  title: "Backend Engineer",
  location: "Pune",
  country_code: "in",
  remote: false,
  description: "Requirements: B.Tech in Computer Science and 3+ years of experience with Java and SQL. ".repeat(6) + " Salary: ₹18-26 LPA. Hybrid in Pune.",
  apply_url: "/jobs/abc",
  salary_min: 1_800_000,
  salary_max: 2_600_000,
  salary_currency: "INR",
  posted_at: null,
  ...over,
});

describe("the hiring-source check for an employer's own opening", () => {
  it("passes only when the account is tied to the company", () => {
    const ok = checkHiringSource(listing({ company: "Razorpay" }), { employer: who("p@razorpay.com") });
    expect(ok).toMatchObject({ key: "source", ok: true });
    expect(ok.detail).toContain("razorpay.com");
  });

  it("fails an impersonator who named their company after a well-known one", () => {
    const bad = checkHiringSource(listing({ company: "Infosys" }), { employer: who("anyone@gmail.com") });
    expect(bad.ok).toBe(false);
  });

  it("fails closed when no employer identity is supplied", () => {
    expect(checkHiringSource(listing()).ok).toBe(false);
    expect(checkHiringSource(listing(), {}).ok).toBe(false);
  });

  it("does not change how other sources are judged", () => {
    const gh = checkHiringSource(listing({ source: "greenhouse", company: "Razorpay", apply_url: "https://boards.greenhouse.io/razorpay/jobs/1" }));
    expect(gh.ok).toBe(true);
  });
});

describe("enrichJob with an employer identity", () => {
  it("holds an impersonator's opening and verifies the real employer's", () => {
    expect(enrichJob(listing(), { employer: who("anyone@gmail.com") }).verification_status).toBe("held");
    expect(enrichJob(listing({ company: "Infosys" }), { employer: who("h@infosys.com") }).verification_status).toBe("verified");
  });

  it("never puts the account's email into the row that is stored for everyone to read", () => {
    const row = enrichJob(listing({ company: "Infosys" }), { employer: who("secret.person@infosys.com") });
    expect(JSON.stringify(row)).not.toContain("secret.person");
  });
});
