import { afterEach, describe, expect, it, vi } from "vitest";
import { applicationToPrompt } from "@/lib/ai/screen-candidate";
import type { TailoredCv } from "@/lib/ai/schemas";
import { checkCriterionText } from "./criteria-guard";
import { buildOutcomeEmail } from "./emails";
import { evaluate, normaliseResults, type Criterion, type CriterionResult } from "./screening";

afterEach(() => vi.unstubAllGlobals());

describe("criteria guard", () => {
  it.each([
    "Aged between 25 and 35",
    "Must be a young, energetic team player",
    "Native speaker of German",
    "Female candidates preferred",
    "Not pregnant",
    "Married with children",
    "Citizen of Germany",
    "Fit and healthy",
    "Christian values",
    "Digital native",
  ])("rejects %s", (text) => {
    expect(checkCriterionText(text)).toMatch(/can't be used to screen/);
  });

  it.each([
    "5+ years of Python",
    "Experience with older versions of Excel and legacy systems",
    "Built a single page app in React",
    "Fluent in German (C1 or above)",
    "Right to work in Germany",
    "Experience with man-hours estimation",
    "Led a team of 8 engineers",
  ])("allows %s", (text) => {
    expect(checkCriterionText(text)).toBeNull();
  });
});

const criteria: Criterion[] = [
  { id: "h1", kind: "hard_requirement", text: "Right to work in Germany" },
  { id: "m1", kind: "must_have", text: "5+ years of Python" },
  { id: "m2", kind: "must_have", text: "Experience with PostgreSQL" },
  { id: "n1", kind: "nice_to_have", text: "Kubernetes" },
];
const r = (criterion_id: string, status: CriterionResult["status"], evidence = "x"): CriterionResult => ({ criterion_id, status, evidence });

describe("screening evaluation", () => {
  it("advances a strong match and explains every criterion", () => {
    const out = evaluate(criteria, [r("h1", "met"), r("m1", "met"), r("m2", "met"), r("n1", "not_met", "No Kubernetes")]);
    // earned 3 + 3 + 0 of 7 possible = 86
    expect(out.score).toBe(86);
    expect(out.recommendation).toBe("advance");
    expect(out.reasons[0]).toContain("86/100");
    expect(out.reasons.some((x) => x.startsWith("Nice-to-have · Not met: Kubernetes"))).toBe(true);
    expect(out.reasons).toHaveLength(1 + criteria.length);
  });

  it("recommends decline when a hard requirement is clearly missed, whatever the score", () => {
    const out = evaluate(criteria, [r("h1", "not_met", "Lives outside the EU, needs sponsorship"), r("m1", "met"), r("m2", "met"), r("n1", "met")]);
    expect(out.score).toBe(100);
    expect(out.recommendation).toBe("decline");
    expect(out.reasons[0]).toContain("Right to work in Germany");
  });

  it("sends an unevidenced hard requirement to a person instead of declining", () => {
    const out = evaluate(criteria, [r("h1", "unclear", ""), r("m1", "met"), r("m2", "met"), r("n1", "met")]);
    expect(out.recommendation).toBe("review");
    expect(out.reasons[0]).toContain("needs to check");
  });

  it("scores unclear as half credit and bands the recommendation", () => {
    const partial = evaluate(criteria, [r("h1", "met"), r("m1", "met"), r("m2", "not_met"), r("n1", "not_met")]);
    expect(partial.score).toBe(43); // 3 of 7
    expect(partial.recommendation).toBe("review");

    const weak = evaluate(criteria, [r("h1", "met"), r("m1", "not_met"), r("m2", "not_met"), r("n1", "met")]);
    expect(weak.score).toBe(14); // 1 of 7
    expect(weak.recommendation).toBe("decline");

    const unsure = evaluate(criteria, [r("h1", "met"), r("m1", "unclear", ""), r("m2", "unclear", ""), r("n1", "unclear", "")]);
    expect(unsure.score).toBe(50);
    expect(unsure.recommendation).toBe("review");
  });

  it("never claims a match without evidence, ignores unknown ids and fills gaps", () => {
    const results = normaliseResults(criteria, [
      r("m1", "met", "   "),
      r("ghost", "met", "invented"),
      r("m1", "met", "duplicate is ignored"),
    ]);
    expect(results.map((x) => x.criterion_id)).toEqual(["h1", "m1", "m2", "n1"]);
    expect(results.find((x) => x.criterion_id === "m1")?.status).toBe("unclear");
    expect(results.find((x) => x.criterion_id === "h1")).toMatchObject({ status: "unclear", evidence: "Not assessed." });
  });

  it("asks for review when there are no criteria, or only hard requirements", () => {
    expect(evaluate([], []).recommendation).toBe("review");
    const onlyHard = evaluate([criteria[0]], [r("h1", "met")]);
    expect(onlyHard.recommendation).toBe("review");
    expect(onlyHard.score).toBe(0);
  });
});

describe("outcome emails", () => {
  const input = { candidateName: "Priya Nair", jobTitle: "Data Engineer", company: "Acme GmbH" };

  it("drafts a selected email that promises next steps but no specifics", () => {
    const mail = buildOutcomeEmail({ ...input, kind: "selected" });
    expect(mail.subject).toBe("Your application for Data Engineer at Acme GmbH");
    expect(mail.body).toContain("Dear Priya Nair,");
    expect(mail.body).toContain("next steps");
  });

  it("drafts a not-selected email that is honest about AI and offers a human review", () => {
    const mail = buildOutcomeEmail({ ...input, kind: "not_selected" });
    expect(mail.body).toContain("AI-assisted screening");
    expect(mail.body).toContain("made by a member of our hiring team");
    expect(mail.body).toContain("request a review");
  });

  it("never leaks scores, criteria or internal notes, and copes with a missing name", () => {
    const mail = buildOutcomeEmail({ ...input, candidateName: null, kind: "not_selected" });
    expect(mail.body.startsWith("Hello,")).toBe(true);
    expect(mail.body).not.toMatch(/score|criteri|\/100|hard requirement/i);
  });
});

describe("candidate prompt", () => {
  const cv: TailoredCv = {
    headline: "Data engineer",
    summary: "Builds pipelines.",
    experiences: [{ source_id: "e1", organisation: "Acme", title: "Engineer", start_date: "2020-01", end_date: null, bullets: ["Built ETL"] }],
    skills: ["SQL"],
    keywords_matched: [],
    keywords_missing: [],
    change_log: [],
    cover_letter: "Hi",
  };

  it("omits the candidate's name and keeps the evidence the AI needs", () => {
    const prompt = applicationToPrompt({ location: "Berlin", cv, cover_letter: "I'd love to join." });
    expect(prompt).toContain("Built ETL");
    expect(prompt).toContain("Berlin");
    expect(prompt).toContain("third-party content");
    expect(prompt).not.toMatch(/full_name|candidate_name/);
  });
});
