import { describe, expect, it } from "vitest";
import { indiaEligibility } from "@/lib/india/location";
import { parseExperience, parseJobType, parseNoticeLimit, statesQualifications } from "@/lib/india/requirements";
import { MAX_PARSE_CHARS } from "@/lib/limits";
import { enrichJob } from "./enrich";
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
    expect(time(() => parseExperience(text))).toBeLessThan(250);
    expect(time(() => parseNoticeLimit(text))).toBeLessThan(250);
    expect(time(() => parseJobType("Engineer", text))).toBeLessThan(250);
    expect(time(() => indiaEligibility({ location: null, description: text }))).toBeLessThan(250);
    expect(time(() => enrichJob(job(text)))).toBeLessThan(500);
  });
});
