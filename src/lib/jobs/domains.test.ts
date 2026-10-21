import { describe, expect, it } from "vitest";
import { belongsToCompany, isFreeHosting, registered } from "./domains";
import { checkHiringSource, companyTokens } from "./verify";

describe("registrable domain", () => {
  it.each([
    ["razorpay.com", "razorpay.com", "razorpay", "com"],
    ["careers.razorpay.com", "razorpay.com", "razorpay", "com"],
    ["jobs.eu.razorpay.in", "razorpay.in", "razorpay", "in"],
    ["razorpay.co.in", "razorpay.co.in", "razorpay", "co.in"],
    ["careers.razorpay.co.in", "razorpay.co.in", "razorpay", "co.in"],
    ["razorpay.com.verify-offer.in", "verify-offer.in", "verify-offer", "in"],
    ["razorpay.careers-portal.top", "careers-portal.top", "careers-portal", "top"],
    ["razorpay.github.io", "github.io", "github", "io"],
  ])("%s -> %s", (host, domain, label, suffix) => {
    expect(registered(host)).toEqual({ domain, label, suffix });
  });

  it.each(["13.233.10.4", "localhost", "co.in", "", "razor pay.com", "[::1]", "a_b.com"])("rejects %j", (host) => {
    expect(registered(host)).toBeNull();
  });
});

describe("free hosting", () => {
  it.each([
    "razorpay.notion.site",
    "razorpay.github.io",
    "razorpay.wixsite.com",
    "razorpay-careers.vercel.app",
    "razorpay.netlify.app",
    "razorpay.blogspot.com",
    "sites.google.com",
    "docs.google.com",
    "razorpay.typeform.com",
    "razorpay.framer.website",
  ])("%s", (host) => {
    expect(isFreeHosting(host)).toBe(true);
  });

  it("doesn't catch real company sites, including Google's own careers site", () => {
    expect(isFreeHosting("razorpay.com")).toBe(false);
    expect(isFreeHosting("careers.google.com")).toBe(false);
  });
});

describe("a company's own domain", () => {
  const own = (company: string, host: string) => belongsToCompany(company, companyTokens(company), host);

  it("accepts the registered domain and anything under it", () => {
    expect(own("Razorpay Software Pvt. Ltd.", "razorpay.com")).toBe(true);
    expect(own("Razorpay", "careers.razorpay.in")).toBe(true);
    expect(own("Razorpay", "razorpay.co.in")).toBe(true);
    expect(own("Tech Mahindra Limited", "techmahindra.com")).toBe(true);
  });

  it("rejects look-alikes", () => {
    for (const host of [
      "razorpay-hiring.xyz",
      "razorpay.careers-portal.top",
      "razorpay.com.verify-offer.in",
      "razorpay-hr.com",
      "razorpayjobs.com",
      "razorpay.co",
      "razorpay.xyz",
      "xn--rzorpay-5ve.com",
      "rnazorpay.com",
    ]) {
      expect(own("Razorpay", host), host).toBe(false);
    }
  });

  it("rejects free hosting that carries the company name", () => {
    expect(own("Razorpay", "razorpay.notion.site")).toBe(false);
    expect(own("Razorpay", "razorpay.github.io")).toBe(false);
  });

  it("knows the big employers whose website isn't their name", () => {
    expect(own("Tata Consultancy Services", "tcs.com")).toBe(true);
    expect(own("Tata Consultancy Services", "ibegin.tcs.com")).toBe(true);
    expect(own("Tata Consultancy Services", "tata-jobs.click")).toBe(false);
    expect(own("Infosys Limited", "infosys.com.verify-offer.in")).toBe(false);
  });

  it("keeps a known domain tied to its own company", () => {
    expect(own("Credit Suisse India", "cred.club")).toBe(false);
    expect(own("Random Startup", "tcs.com")).toBe(false);
  });
});

describe("hiring source: the audit's look-alike cases", () => {
  const check = (apply_url: string, company = "Razorpay") =>
    checkHiringSource({ source: "user_submitted", company, apply_url, description: "" });

  it.each([
    ["https://razorpay.com/jobs/1", "Razorpay", true],
    ["https://boards.greenhouse.io/razorpay/jobs/1", "Razorpay", true],
    ["https://www.naukri.com/job-listings-backend-razorpay-123", "Razorpay", true],
    ["https://www.linkedin.com/jobs/view/4012345678", "Razorpay", true],
    ["https://razorpay.careers-portal.top/apply", "Razorpay", false],
    ["https://razorpay-hiring.xyz/apply", "Razorpay", false],
    ["https://infosys.com.verify-offer.in/apply", "Infosys", false],
    ["https://tata-jobs.click/apply", "Tata Consultancy Services", false],
    ["https://razorpay.notion.site/careers", "Razorpay", false],
    ["https://razorpay.github.io/jobs", "Razorpay", false],
    ["https://razorpay.wixsite.com/careers", "Razorpay", false],
    ["https://razorpay-careers.vercel.app", "Razorpay", false],
    ["https://sites.google.com/view/razorpay-careers", "Razorpay", false],
    ["mailto:careers@razorpay-hr.com", "Razorpay", false],
    ["mailto:hr@razorpay.co", "Razorpay", false],
    ["mailto:careers@razorpay.com", "Razorpay", true],
    ["mailto:careers@mail.razorpay.com", "Razorpay", true],
    ["https://wa.me/919876543210", "Razorpay", false],
    ["javascript:alert(1)", "Razorpay", false],
    ["https://13.233.10.4/apply", "Razorpay", false],
    ["https://xn--rzorpay-5ve.com/apply", "Razorpay", false],
    ["https://linkedin.com.evil.com/jobs/view/1", "Razorpay", false],
    ["https://linkedin.com@evil.com/jobs/view/1", "Razorpay", false],
  ])("%s for %s -> %s", (url, company, want) => {
    expect(check(url, company).ok).toBe(want);
  });

  it("fails an email with a stray second recipient", () => {
    expect(check("mailto:careers@razorpay.com,payments@evil.in").ok).toBe(false);
    expect(check("mailto:careers@razorpay.com;hr.razorpay@gmail.com").ok).toBe(false);
    expect(check("mailto:careers@razorpay.com,hr@razorpay.in").ok).toBe(true);
  });

  it("recognises more free mailboxes", () => {
    for (const mail of ["hr@pm.me", "hr@proton.me", "razorpay.hr@yahoo.co.in", "razorpay@rediffmail.com", "razorpay@outlook.in"]) {
      expect(check(`mailto:${mail}`).ok, mail).toBe(false);
    }
  });

  it("says why", () => {
    expect(check("https://razorpay.github.io/jobs").detail).toMatch(/free website or page builder/);
    expect(check("mailto:hr@razorpay.co").detail).toMatch(/isn't Razorpay's own domain/);
    expect(check("https://razorpay-hiring.xyz/apply").detail).toMatch(/isn't Razorpay's website/);
  });
});
