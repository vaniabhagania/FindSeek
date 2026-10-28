import { describe, expect, it } from "vitest";
import { statesQualifications } from "@/lib/india/requirements";
import { fillerReason } from "./text";
import { verifyListing } from "./verify";
import type { NormalizedJob } from "./types";

// A real ad is not a short paragraph repeated until it is long enough, and "Requirements:" followed by
// one word is not a list of requirements.

const REAL_AD = `Razorpay is hiring a Backend Engineer for our payments platform team in Bengaluru. You will design and
build APIs that move money for millions of Indian businesses, own services end to end, and work closely with
product and design to ship reliable features every week.

Requirements:
- B.Tech / B.E. in Computer Science or equivalent
- 2-4 years of experience building backend services in Go or Java
- Strong knowledge of SQL databases and distributed systems

Compensation: ₹18-26 LPA plus ESOPs. Hybrid, three days a week in our Koramangala office.`;

const job = (description: string): NormalizedJob => ({
  source: "greenhouse", external_id: "razorpay:1", company: "Razorpay", title: "Backend Engineer", location: "Bengaluru",
  country_code: null, remote: null, description, apply_url: "https://boards.greenhouse.io/razorpay/jobs/1",
  salary_min: null, salary_max: null, salary_currency: null, posted_at: "2026-10-18T00:00:00Z",
});
const check = (description: string, key: string) => verifyListing(job(description)).checks.find((c) => c.key === key)!;

describe("fillerReason", () => {
  it("accepts a real ad", () => {
    expect(fillerReason(REAL_AD)).toBeNull();
  });

  it("accepts a short but genuine ad of about eighty words", () => {
    const short = `We are hiring a data analyst intern in Pune for three months. You will clean sales data, build weekly dashboards
      in Excel and Power BI, and present findings to the regional managers. Requirements: pursuing a B.Com or BBA degree,
      good knowledge of Excel formulas, and familiarity with SQL basics. Stipend: ₹15,000 per month. Work from our Pune office
      five days a week. Selected candidates may be offered a full time role after the internship ends successfully.`;
    expect(fillerReason(short)).toBeNull();
  });

  it.each([
    ["one sentence repeated", "Join our amazing team in Pune! We love great culture, free snacks, team lunches and fun offsites. ".repeat(8)],
    ["a short phrase repeated", "We are a fast-growing startup. ".repeat(30)],
    ["a handful of words repeated", "great job apply now good salary ".repeat(30)],
    ["the same ad pasted over and over", REAL_AD.repeat(3)],
  ])("rejects %s", (_name, text) => {
    expect(fillerReason(text)).not.toBeNull();
  });

  it("rejects a sentence repeated among a few others", () => {
    const padded = `${REAL_AD.slice(0, 200)}. ${"Apply today and join us. ".repeat(10)}`;
    expect(fillerReason(padded)).toMatch(/repeat/i);
  });

  it("says why", () => {
    expect(fillerReason("great job apply now good salary ".repeat(30))).toMatch(/different words|repeat/i);
  });
});

describe("the description check", () => {
  it("passes a real ad and says how long it is", () => {
    expect(check(REAL_AD, "description")).toMatchObject({ ok: true });
  });

  it("holds an ad made long by repetition, even though it is over eighty words", () => {
    const padded = "Join our amazing team in Pune! We love great culture, free snacks, team lunches and fun offsites. ".repeat(8);
    expect(padded.trim().split(/\s+/).length).toBeGreaterThan(80);
    const c = check(padded, "description");
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/repeat|different words/i);
  });

  it("still holds a thin snippet for being short", () => {
    expect(check("Backend role. ₹10 LPA. Requirements: B.Tech.", "description").detail).toMatch(/too short/);
  });
});

describe("the qualifications check needs specifics, not a keyword", () => {
  it.each([
    ["Requirements:\n- B.Tech in CS\n- 2+ years with Node.js"],
    ["Qualifications: Any graduate with 1-2 years of experience in customer support."],
    ["Eligibility: B.Tech / B.E. (any branch). Knowledge of Python and SQL."],
    [REAL_AD],
  ])("accepts %s", (text) => {
    expect(statesQualifications(text).ok).toBe(true);
  });

  it.each([
    ["a heading and one keyword", "Requirements: a degree. We love great culture, free snacks and team lunches, and offsites."],
    ["a heading and a different single keyword", "Qualifications: 3 years. Join our amazing team and enjoy a fun workplace."],
    ["no heading and two keywords", "We would like a degree and some experience with fun. Come and join our dynamic family today."],
    ["one keyword repeated many times", "degree degree degree degree degree degree degree degree. Join us."],
    ["the same years phrase repeated", "5 years 5 years 5 years 5 years 5 years. Great culture and snacks."],
    ["nothing", "Join our amazing team! Great culture and snacks."],
  ])("rejects %s", (_name, text) => {
    expect(statesQualifications(text).ok).toBe(false);
  });

  it("holds a padded ad with a single keyword under a heading", () => {
    const text = `Requirements: a degree. ${"We are a fast-growing startup with a great culture and free snacks. ".repeat(10)} Salary: ₹20,000 per month.`;
    const v = verifyListing(job(text));
    expect(v.checks.find((c) => c.key === "qualifications")?.ok).toBe(false);
    expect(v.checks.find((c) => c.key === "description")?.ok).toBe(false);
    expect(v.status).toBe("held");
  });
});

describe("the word 'be' is not a degree", () => {
  it("does not count ordinary prose as an education requirement", () => {
    const prose = "Requirements: you will be great and you should be happy. 3 years.";
    expect(statesQualifications(prose).ok).toBe(false);
  });
  it("still reads B.E. and BE written as a degree", () => {
    expect(statesQualifications("Requirements: B.E. in Mechanical. 3 years in a plant.").ok).toBe(true);
    expect(statesQualifications("Requirements: BE / B.Tech any branch. 2 years of experience.").ok).toBe(true);
    expect(statesQualifications("Eligibility: BE in Electronics, knowledge of embedded C.").ok).toBe(true);
  });
});
