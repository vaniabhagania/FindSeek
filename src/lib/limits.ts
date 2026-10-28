// Size and usage limits in one place, so a change is made once and the tests can see it.

/** Longest job post a user may paste, and longest description an employer may save. */
export const MAX_POST_CHARS = 20_000;

/**
 * Longest job title that is read to tell vacancies apart. Real titles are a few dozen characters and
 * the employer form stops at 160; anything past this is junk, and reading it all is not free.
 */
export const MAX_TITLE_CHARS = 300;

/** Longest "what I'm looking for" text read during onboarding. */
export const MAX_INTAKE_CHARS = 3_000;

/**
 * The parsers that read pay, scam signals and requirements never look past this many characters,
 * whatever the source (Greenhouse, Lever, Adzuna or a pasted post). A second line of defence behind
 * the input caps above, for text that arrives from the daily import rather than from a form.
 */
export const MAX_PARSE_CHARS = 40_000;

/**
 * Daily limits per signed-in user on the actions that call the paid AI model. Counted in the
 * database (table `ai_usage`), so they hold across servers and restarts.
 */
export const DAILY_LIMITS = {
  /** "Bring a job": read a pasted post. */
  bring_job: 10,
  /** Onboarding: turn a person's own words into filters. */
  read_intake: 5,
  /** Reading an uploaded CV. */
  parse_cv: 5,
  /** "Find new matches": each run scores up to MATCHES_PER_RUN jobs. */
  find_matches: 6,
  /** Tailoring a CV for one job. */
  tailor_cv: 20,
} as const;

export type LimitedAction = keyof typeof DAILY_LIMITS;
