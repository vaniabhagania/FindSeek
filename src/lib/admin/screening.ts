// Deterministic half of candidate screening. The AI only reports, per criterion, whether the
// candidate's materials evidence it. The score and the recommendation come from the rules below,
// so a recruiter (or a candidate exercising their rights) can see exactly how they were reached.

export type CriterionKind = "hard_requirement" | "must_have" | "nice_to_have";
export type CriterionStatus = "met" | "not_met" | "unclear";
export type Recommendation = "advance" | "review" | "decline";

export interface Criterion {
  id: string;
  kind: CriterionKind;
  text: string;
}

export interface CriterionResult {
  criterion_id: string;
  status: CriterionStatus;
  evidence: string;
}

export interface ScreeningOutcome {
  score: number;
  recommendation: Recommendation;
  reasons: string[];
  results: CriterionResult[];
}

export const ADVANCE_AT = 70;
export const REVIEW_AT = 40;

const WEIGHT: Record<Exclude<CriterionKind, "hard_requirement">, number> = { must_have: 3, nice_to_have: 1 };
const POINTS: Record<CriterionStatus, number> = { met: 1, unclear: 0.5, not_met: 0 };

const KIND_LABEL: Record<CriterionKind, string> = {
  hard_requirement: "Hard requirement",
  must_have: "Must-have",
  nice_to_have: "Nice-to-have",
};
const STATUS_LABEL: Record<CriterionStatus, string> = {
  met: "Met",
  not_met: "Not met",
  unclear: "Unclear",
};

/**
 * Makes the AI's per-criterion answer safe to score: exactly one result per criterion, unknown ids
 * dropped, and a "met" claim without evidence downgraded to "unclear". The AI can't claim a match
 * it can't point to.
 */
export function normaliseResults(criteria: Criterion[], raw: CriterionResult[]): CriterionResult[] {
  const byId = new Map<string, CriterionResult>();
  for (const r of raw) if (!byId.has(r.criterion_id)) byId.set(r.criterion_id, r);

  return criteria.map((c) => {
    const r = byId.get(c.id);
    if (!r) return { criterion_id: c.id, status: "unclear", evidence: "Not assessed." };
    const evidence = r.evidence.trim();
    if (r.status === "met" && !evidence) {
      return { criterion_id: c.id, status: "unclear", evidence: "No supporting evidence found in the application." };
    }
    return { criterion_id: c.id, status: r.status, evidence };
  });
}

export function evaluate(criteria: Criterion[], rawResults: CriterionResult[]): ScreeningOutcome {
  const results = normaliseResults(criteria, rawResults);
  const statusOf = new Map(results.map((r) => [r.criterion_id, r]));

  const reasons: string[] = [];
  const hard = criteria.filter((c) => c.kind === "hard_requirement");
  const weighted = criteria.filter((c) => c.kind !== "hard_requirement");

  let earned = 0;
  let possible = 0;
  for (const c of weighted) {
    const w = WEIGHT[c.kind as keyof typeof WEIGHT];
    possible += w;
    earned += w * POINTS[statusOf.get(c.id)!.status];
  }
  const score = possible === 0 ? 0 : Math.round((100 * earned) / possible);

  const hardMissed = hard.filter((c) => statusOf.get(c.id)!.status === "not_met");
  const hardUnclear = hard.filter((c) => statusOf.get(c.id)!.status === "unclear");

  let recommendation: Recommendation;
  if (criteria.length === 0) {
    recommendation = "review";
    reasons.push("No criteria were set for this opening, so there is nothing to assess against.");
  } else if (hardMissed.length > 0) {
    recommendation = "decline";
    reasons.push(`Does not meet ${hardMissed.length === 1 ? "a hard requirement" : "hard requirements"}: ${hardMissed.map((c) => c.text).join("; ")}.`);
  } else if (hardUnclear.length > 0) {
    recommendation = "review";
    reasons.push(`A person needs to check ${hardUnclear.length === 1 ? "a hard requirement" : "hard requirements"} the application doesn't show: ${hardUnclear.map((c) => c.text).join("; ")}.`);
  } else if (possible === 0) {
    recommendation = "review";
    reasons.push("The only criteria are hard requirements, and all are met. There is no must-have or nice-to-have to rank on.");
  } else if (score >= ADVANCE_AT) {
    recommendation = "advance";
    reasons.push(`Scores ${score}/100 on must-haves and nice-to-haves (advance at ${ADVANCE_AT} or more).`);
  } else if (score >= REVIEW_AT) {
    recommendation = "review";
    reasons.push(`Scores ${score}/100: a partial match (review from ${REVIEW_AT}, advance from ${ADVANCE_AT}).`);
  } else {
    recommendation = "decline";
    reasons.push(`Scores ${score}/100, below the ${REVIEW_AT} needed for review.`);
  }

  for (const c of criteria) {
    const r = statusOf.get(c.id)!;
    reasons.push(`${KIND_LABEL[c.kind]} · ${STATUS_LABEL[r.status]}: ${c.text}${r.evidence ? ` (${r.evidence})` : ""}`);
  }

  return { score, recommendation, reasons, results };
}
