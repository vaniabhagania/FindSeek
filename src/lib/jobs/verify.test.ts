import { describe, expect, it } from "vitest";
import { keepOnlyQuoted } from "@/lib/ai/extract-listing";
import { collapseDuplicates, dedupeKey } from "./dedupe";
import { enrichJob } from "./enrich";
import { fitChecks, fitSummary, type Preferences } from "./fit";
import { checkedAgo, freshness, ghostSignals } from "./freshness";
import { livenessUrl } from "./liveness";
import { scamFlags } from "./scam";
import type { NormalizedJob } from "./types";
import { checkHiringSource, companyTokens, verifyListing } from "./verify";

const GOOD_DESCRIPTION = `Razorpay is hiring a Backend Engineer for our payments platform team in Bengaluru.
You will design and build APIs that move money for millions of Indian businesses, own services end to end,
and work closely with product and design to ship reliable features every week.

Requirements:
- B.Tech / B.E. in Computer Science or equivalent
- 2-4 years of experience building backend services in Go or Java
- Strong knowledge of SQL databases and distributed systems
- Notice period of max 30 days

Compensation: ₹18-26 LPA plus ESOPs. Hybrid, three days a week in our Koramangala office.
We review every application and reply within two weeks. Apply through our careers page.`;

const job = (over: Partial<NormalizedJob> = {}): NormalizedJob => ({
  source: "greenhouse",
  external_id: "razorpay:123",
  company: "Razorpay Software Pvt. Ltd.",
  title: "Backend Engineer",
  location: "Bengaluru, India",
  country_code: null,
  remote: null,
  description: GOOD_DESCRIPTION,
  apply_url: "https://boards.greenhouse.io/razorpay/jobs/123",
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  posted_at: "2026-10-18T00:00:00Z",
  ...over,
});

describe("verification gate", () => {
  it("verifies a complete listing from the employer's own board", () => {
    const v = verifyListing(job());
    expect(v.checks.filter((c) => !c.ok)).toEqual([]);
    expect(v.status).toBe("verified");
    expect(v.pay).toMatchObject({ minAnnualInr: 1_800_000, maxAnnualInr: 2_600_000 });
  });

  it("holds a listing with no pay, and says why", () => {
    const v = verifyListing(job({ description: GOOD_DESCRIPTION.replace(/Compensation:.*\n/, "Competitive salary.\n") }));
    expect(v.status).toBe("held");
    expect(v.checks.find((c) => c.key === "pay")).toMatchObject({ ok: false, detail: "No salary, CTC or stipend given" });
  });

  it("holds a listing with no qualifications", () => {
    const vague = "We are a fast-growing startup. ".repeat(20) + "Stipend ₹20,000 per month.";
    const v = verifyListing(job({ description: vague }));
    expect(v.checks.find((c) => c.key === "qualifications")?.ok).toBe(false);
  });

  it("holds a thin snippet", () => {
    expect(verifyListing(job({ description: "Backend role. ₹10 LPA. Requirements: B.Tech." })).checks.find((c) => c.key === "description")?.ok).toBe(false);
  });

  it("holds a remote role locked to the US", () => {
    const v = verifyListing(job({ location: "Remote - US", description: GOOD_DESCRIPTION.replace("in Bengaluru", "") }));
    expect(v.checks.find((c) => c.key === "india")?.ok).toBe(false);
  });

  it("holds a listing with scam signals", () => {
    const v = verifyListing(job({ description: `${GOOD_DESCRIPTION}\nPay a refundable security deposit of ₹2,000 to confirm your seat.` }));
    expect(v.checks.find((c) => c.key === "safety")?.ok).toBe(false);
  });

  it("accepts foreign-currency pay for global remote roles", () => {
    const v = verifyListing(job({
      location: "Remote", salary_min: 60000, salary_max: 90000, salary_currency: "USD",
      description: GOOD_DESCRIPTION.replace(/Compensation:.*\n/, "We hire anywhere in the world.\n"),
    }));
    expect(v.checks.find((c) => c.key === "pay")?.ok).toBe(true);
    expect(v.foreignPay).toMatchObject({ currency: "USD" });
  });
});

describe("hiring source", () => {
  const src = (apply_url: string, company = "Razorpay", source: NormalizedJob["source"] = "user_submitted") =>
    checkHiringSource({ source, company, apply_url, description: "" });

  it("trusts applicant tracking systems and the company's own domain", () => {
    expect(src("https://jobs.lever.co/razorpay/abc").ok).toBe(true);
    expect(src("https://razorpay.com/jobs/backend").ok).toBe(true);
    expect(src("https://careers.razorpay.in/jobs/42").ok).toBe(true);
    expect(src("https://www.linkedin.com/jobs/view/4012345678").ok).toBe(true);
  });

  it("rejects places that don't identify an employer", () => {
    expect(src("https://wa.me/919876543210").ok).toBe(false);
    expect(src("https://bit.ly/3xyz").ok).toBe(false);
    expect(src("https://forms.gle/abc").ok).toBe(false);
    expect(src("https://www.instagram.com/p/C1abc/").ok).toBe(false);
    expect(src("https://www.linkedin.com/posts/someone_hiring-activity-123").ok).toBe(false);
    expect(src("http://razorpay.com/jobs").ok).toBe(false); // not https
    expect(src("https://random-jobs-hub.in/apply").ok).toBe(false);
  });

  it("checks application emails", () => {
    expect(src("mailto:hr.razorpay@gmail.com").ok).toBe(false);
    expect(src("mailto:careers@razorpay.com").ok).toBe(true);
    expect(src("mailto:jobs@somethingelse.com").ok).toBe(false);
  });

  it("needs a named employer", () => {
    expect(src("https://razorpay.com/jobs", "").ok).toBe(false);
  });

  it("strips legal suffixes to match a company to its domain", () => {
    expect(companyTokens("Razorpay Software Pvt. Ltd.")).toEqual(["razorpay"]);
  });
});

describe("India scam signals", () => {
  it("flags the common fake-offer patterns", () => {
    const flags = scamFlags({
      title: "Data entry work from home",
      description: "Simple typing job. Earn ₹5,000 daily from home. No interview, direct joining. Pay registration fee of ₹999. WhatsApp only: +91 98765 43210",
    });
    expect(flags).toEqual(expect.arrayContaining([
      "Asks for an upfront fee or deposit",
      "Promises unrealistic pay for little work",
      "No interview, direct joining",
      "Hires only through a messaging app",
    ]));
  });
  it("leaves normal ads alone", () => {
    expect(scamFlags({ title: "Engineer", description: GOOD_DESCRIPTION })).toEqual([]);
  });
});

describe("duplicates", () => {
  it("gives the same vacancy on different sites the same key", () => {
    expect(dedupeKey({ company: "Razorpay Software Pvt Ltd", title: "Backend Engineer (Hybrid)", location: "Bangalore" }))
      .toBe(dedupeKey({ company: "Razorpay", title: "Backend Engineer - Bengaluru", location: "Bengaluru, Karnataka" }));
  });
  it("keeps the employer's own copy over an aggregator's", () => {
    const kept = collapseDuplicates([job({ source: "adzuna", external_id: "1" }), job({ source: "greenhouse" })]);
    expect(kept).toHaveLength(1);
    expect(kept[0].source).toBe("greenhouse");
  });
});

describe("freshness and ghost signals", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("grades listings by age and last live check", () => {
    expect(freshness({ posted_at: "2026-10-20T00:00:00Z", last_seen_at: "2026-10-21T06:00:00Z" }, now)).toBe("new");
    expect(freshness({ posted_at: "2026-10-20T00:00:00Z", last_seen_at: "2026-10-10T06:00:00Z" }, now)).toBe("stale");
    expect(freshness({ posted_at: "2026-10-20T00:00:00Z", closed_at: "2026-10-21T00:00:00Z" }, now)).toBe("closed");
    expect(checkedAgo("2026-10-21T09:00:00Z", now)).toBe("Checked live 3 hours ago");
  });
  it("explains ghost-job signals", () => {
    const signals = ghostSignals({ posted_at: "2026-07-01T00:00:00Z", description: "Join our talent pool", repost_count: 3 }, now);
    expect(signals).toHaveLength(3);
  });
  it("knows how to re-check company boards", () => {
    expect(livenessUrl({ source: "greenhouse", external_id: "stripe:42" })).toBe("https://boards-api.greenhouse.io/v1/boards/stripe/jobs/42");
    expect(livenessUrl({ source: "adzuna", external_id: "99" })).toBeNull();
  });
});

describe("enrichJob", () => {
  it("stores the facts users filter on", () => {
    const row = enrichJob(job());
    expect(row).toMatchObject({
      verification_status: "verified",
      cities: ["Bengaluru"],
      work_mode: "hybrid",
      job_type: "full_time",
      experience_min: 2,
      experience_max: 4,
      notice_max_days: 30,
      pay_min_inr: 1_800_000,
      pay_max_inr: 2_600_000,
      india_eligibility: "eligible",
    });
  });
});

describe("personal fit", () => {
  const prefs: Preferences = {
    career_stage: "experienced", experience_years: 3, preferred_cities: ["Bengaluru"], open_to_relocate: false,
    remote_preference: "any", job_types: ["full_time"], expected_pay_min_inr: 2_000_000, notice_period_days: 60,
    deal_breakers: ["service bond"],
  };
  const row = enrichJob(job());

  it("explains each check in plain words", () => {
    const checks = fitChecks(row, prefs);
    expect(checks).toEqual(expect.arrayContaining([
      { key: "city", level: "good", text: "In Bengaluru" },
      { key: "pay", level: "caution", text: "Pay range reaches ₹26 LPA; negotiate for ₹20 LPA+" },
      { key: "experience", level: "good", text: "Matches your experience" },
      { key: "notice", level: "blocker", text: "Wants joining within 30 days; your notice is 60" },
    ]));
    expect(fitSummary(checks)).toEqual({ blockers: 1, cautions: 1 });
  });

  it("catches the user's own deal-breakers", () => {
    const bonded = enrichJob(job({ description: `${GOOD_DESCRIPTION}\nA 2-year service bond applies.` }));
    expect(fitChecks(bonded, { ...prefs, notice_period_days: 30 }).filter((c) => c.level === "blocker").map((c) => c.text))
      .toEqual(["Mentions a service bond"]);
  });

  it("blocks jobs in other cities unless the user will relocate", () => {
    const pune = enrichJob(job({ location: "Pune", description: GOOD_DESCRIPTION.replace("in Bengaluru", "in Pune") }));
    expect(fitChecks(pune, prefs).find((c) => c.key === "city")?.level).toBe("blocker");
    expect(fitChecks(pune, { ...prefs, open_to_relocate: true }).find((c) => c.key === "city")?.level).toBe("caution");
  });

  it("compares stipends per month for students", () => {
    const intern = enrichJob(job({ title: "Backend Intern", description: GOOD_DESCRIPTION.replace(/Compensation:.*\n/, "Stipend ₹15,000 per month.\n") }));
    const student: Preferences = { ...prefs, career_stage: "student", experience_years: null, job_types: ["internship"], expected_pay_min_inr: 240_000, notice_period_days: null, deal_breakers: [] };
    expect(fitChecks(intern, student).find((c) => c.key === "pay")).toEqual({ key: "pay", level: "blocker", text: "Pays up to ₹15k/month; you want ₹20k/month" });
  });
});

describe("pasted posts", () => {
  it("throws away anything the AI returns that isn't literally in the post", () => {
    const post = "We're hiring! Backend Intern at Zeta. Stipend ₹25,000/month. Apply: careers@zeta.tech";
    const kept = keepOnlyQuoted(post, {
      is_job_post: true, company: "Zeta", title: "Backend Intern", location: "Bengaluru",
      apply_link: "careers@zeta.tech", pay_quote: "₹40,000/month", qualifications_quote: "B.Tech required",
    });
    expect(kept).toMatchObject({ company: "Zeta", apply_link: "careers@zeta.tech", location: null, pay_quote: null, qualifications_quote: null });
  });
});
