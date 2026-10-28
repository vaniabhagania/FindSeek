import { describe, expect, it } from "vitest";
import { indiaEligibility } from "@/lib/india/location";
import { parseExperience, parseJobType, parseNoticeLimit, statesQualifications } from "@/lib/india/requirements";
import { MAX_PARSE_CHARS } from "@/lib/limits";
import { dedupeKey } from "./dedupe";
import { enrichJob } from "./enrich";
import { fitChecks } from "./fit";
import { fillerReason } from "./text";
import type { NormalizedJob } from "./types";

// One bad post must never be able to tie up the server. These feed every reader in the gate the
// longest text it will ever see, built from the shapes that make careless patterns slow.

const N = MAX_PARSE_CHARS;
const nasty: [string, string][] = [
  ["comma digits", "1,".repeat(N / 2)],
  ["rupee signs", "₹1 ".repeat(N / 3)],
  ["one huge number", `${"9".repeat(N - 6)} lakh`],
  ["spaces", `1${" ".repeat(N - 10)}x`],
  ["letters", "a ".repeat(N / 2)],
  ["notice words", `${"notice period ".repeat(N / 14)}x`],
  ["requirement words", "requirements ".repeat(N / 13)],
  ["years", "1-".repeat(N / 2)],
  ["experience words", "years of experience ".repeat(N / 20)],
  ["remote words", "remote ".repeat(N / 7)],
  ["india words", "india hire ".repeat(N / 11)],
  ["except words", "except the ".repeat(N / 11)],
  ["negation words", "we do not hire ".repeat(N / 15)],
  ["negation then india", `${"cannot ".repeat(N / 7 - 1)}india`],
  ["join words", "join our ".repeat(N / 9)],
  ["outside words", "hiring outside ".repeat(N / 15)],
  ["long clause with india", `india ${"a".repeat(N - 12)} remote`],
  ["salary words", "salary 1 ".repeat(N / 9)],
  ["fee words", "registration fee ".repeat(N / 17)],
  ["newlines", "\n".repeat(N)],
];

const job = (description: string): NormalizedJob => ({
  source: "user_submitted",
  external_id: "x",
  company: "Razorpay",
  title: "Engineer",
  location: "Bengaluru",
  country_code: null,
  remote: null,
  description,
  apply_url: "https://razorpay.com/jobs/1",
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  posted_at: "2026-10-18T00:00:00Z",
});

const time = (fn: () => unknown) => {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
};

describe("every reader stays fast on the longest hostile text", () => {
  it.each(nasty)("%s", (_name, text) => {
    expect(time(() => statesQualifications(text))).toBeLessThan(250);
    expect(time(() => fillerReason(text))).toBeLessThan(250);
    expect(time(() => parseExperience(text))).toBeLessThan(250);
    expect(time(() => parseNoticeLimit(text))).toBeLessThan(250);
    expect(time(() => parseJobType("Engineer", text))).toBeLessThan(250);
    expect(time(() => indiaEligibility({ location: null, description: text }))).toBeLessThan(250);
    expect(time(() => enrichJob(job(text)))).toBeLessThan(500);
  });
});

// Titles reach the dedupe key from every source, including a pasted post. A title made of thousands of
// unclosed brackets once took seconds, so the key only reads the first part of a title.
describe("the dedupe key stays fast on a hostile title", () => {
  const titles: [string, string][] = [
    ["open parentheses", "(".repeat(N)],
    ["open brackets with spaces", "[ ".repeat(N / 2)],
    ["unclosed parenthesis then words", `(${"x ".repeat(N / 2)}`],
    ["city names", "Pune ".repeat(N / 5)],
    ["dashes", "-".repeat(N)],
    ["roman numerals", "ii ".repeat(N / 3)],
  ];
  it.each(titles)("%s", (_name, title) => {
    expect(time(() => dedupeKey({ company: "Razorpay Software Pvt Ltd", title, location: "Pune" }))).toBeLessThan(100);
    expect(time(() => enrichJob({ ...job("Requirements: B.Tech. Salary: 12 LPA."), title }))).toBeLessThan(500);
  });

  it("still reads the part of a long title that identifies the role", () => {
    const long = `Backend Engineer II ${"(".repeat(N)}`;
    expect(dedupeKey({ company: "Razorpay", title: long, location: "Pune" })).toBe(
      dedupeKey({ company: "Razorpay", title: "Backend Engineer II", location: "Pune" }),
    );
  });
});

describe("deal-breaker matching stays fast on a hostile description", () => {
  const prefs = {
    career_stage: null, experience_years: null, preferred_cities: [], open_to_relocate: false, remote_preference: "any" as const,
    job_types: [], expected_pay_min_inr: null, notice_period_days: null,
    deal_breakers: ["service bond", "night shifts", "sales targets", "travel", "weekend work", "unpaid", "relocation"],
  };
  const base = enrichJob(job("Requirements: B.Tech. Salary: 12 LPA."));
  it.each([
    ["many mentions", "a service bond. ".repeat(N / 16)],
    ["many denials", "no night shifts, no weekend work; ".repeat(N / 33)],
    ["no breaks at all", `${"no ".repeat(N / 3 - 2)}service bond`],
    ["long run of clause breaks", `${",".repeat(N - 12)}service bond`],
  ])("%s", (_name, description) => {
    expect(time(() => fitChecks({ ...base, description } as Parameters<typeof fitChecks>[0], prefs))).toBeLessThan(500);
  });
});
