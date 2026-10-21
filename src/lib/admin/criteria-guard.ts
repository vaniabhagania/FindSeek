// Screening criteria are free text written by employers. Criteria that target protected
// characteristics are discriminatory in the UK, EU, Germany (AGG) and India's equality norms
// alike, so they are rejected before they are saved or ever reach the AI.
// Patterns are deliberately narrow: "older versions of Excel" or "single page app" must pass.

const RULES: { label: string; test: RegExp }[] = [
  {
    label: "age",
    test: /\b(?:aged?\s*(?:between|under|over|below|above|\d)|\d{2}\s*(?:-|to)\s*\d{2}\s*(?:years?|yrs?)\s*old|(?:young|youthful|mature)\s+(?:candidate|person|people|team|professional|applicant)s?|(?:young|youthful)(?:\s*,|\s+and)\s+\w+|digital natives?)\b/i,
  },
  {
    label: "sex or gender",
    test: /\b(?:male|female|women|woman|gender|(?:men|women)\s+only|must be (?:a )?(?:man|woman))\b/i,
  },
  {
    label: "race, ethnicity, nationality or caste",
    test: /\b(?:nationality|citizens? of|native[- ]speakers?|ethnic\w*|race|racial|caucasian|caste)\b/i,
  },
  {
    label: "religion or belief",
    test: /\b(?:religio\w*|christian|muslim|hindu|jewish|sikh|buddhist|atheist)\b/i,
  },
  {
    label: "marital or family status, pregnancy",
    test: /\b(?:marital status|unmarried|married|family status|(?:has|with|no) (?:young )?children|pregnan\w*|maternity)\b/i,
  },
  {
    label: "disability or health",
    test: /\b(?:disabled|disabilit\w*|health (?:status|condition)|medical condition|fit and healthy|able-bodied)\b/i,
  },
  {
    label: "sexual orientation",
    test: /\b(?:sexual orientation|gay|lesbian|lgbt\w*|heterosexual)\b/i,
  },
  {
    label: "political opinion or union membership",
    test: /\b(?:political (?:views?|affiliations?|part(?:y|ies))|trade union|union member\w*)\b/i,
  },
];

/** The names of the protected characteristics checked, in the order the rules run. */
export const CRITERION_LABELS: readonly string[] = RULES.map((r) => r.label);

/** Index into CRITERION_LABELS of the first rule the text breaks, or null if it is fine. */
export function criterionViolation(text: string): number | null {
  const i = RULES.findIndex((r) => r.test.test(text));
  return i === -1 ? null : i;
}

/**
 * Returns a message explaining why the criterion cannot be used, or null if it is fine.
 * The message suggests a lawful alternative, because most of these have one
 * (e.g. "native speaker" -> "fluent in German, C1 or above").
 */
export function checkCriterionText(text: string): string | null {
  const i = criterionViolation(text);
  if (i === null) return null;
  return `This criterion appears to refer to ${RULES[i].label}, which can't be used to screen candidates. State the job-related requirement instead (for example a skill, a certification, a language level, or the right to work in a country).`;
}
