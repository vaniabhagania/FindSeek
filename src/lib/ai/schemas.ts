import { z } from "zod";

// Note: numeric ranges are enforced after parsing (see clamp in score-match.ts),
// because structured-output JSON schemas don't support every Zod refinement.

export const ParsedCvSchema = z.object({
  full_name: z.string().nullable(),
  headline: z.string().nullable(),
  location: z.string().nullable(),
  experiences: z.array(
    z.object({
      kind: z.enum(["work", "education", "project", "certification", "volunteering"]),
      organisation: z.string(),
      title: z.string(),
      location: z.string().nullable(),
      start_date: z.string().nullable().describe("YYYY-MM, or null if not stated"),
      end_date: z.string().nullable().describe("YYYY-MM, or null if current / not stated"),
      bullets: z.array(z.string()),
    }),
  ),
  skills: z.array(
    z.object({
      name: z.string(),
      years: z.number().nullable().describe("Only if the CV states it; otherwise null"),
    }),
  ),
});
export type ParsedCv = z.infer<typeof ParsedCvSchema>;

export const MatchSchema = z.object({
  score: z.number().describe("0-100 fit of the candidate's verified profile for this job"),
  strengths: z.array(z.string()).describe("Requirements the candidate clearly meets, with evidence"),
  gaps: z.array(z.string()).describe("Requirements not evidenced in the profile"),
  summary: z.string().describe("One or two sentences a candidate can act on"),
});
export type Match = z.infer<typeof MatchSchema>;

export const ScreeningResultSchema = z.object({
  criteria_results: z.array(
    z.object({
      criterion_id: z.string().describe("The id of the criterion, copied exactly"),
      status: z.enum(["met", "not_met", "unclear"]),
      evidence: z
        .string()
        .describe("The specific part of the application that shows this, or why it is missing. Empty only if status is unclear and nothing is relevant"),
    }),
  ),
  summary: z.string().describe("Two or three plain sentences a recruiter can read in ten seconds"),
});
export type ScreeningResult = z.infer<typeof ScreeningResultSchema>;

export const TailoredCvSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  experiences: z.array(
    z.object({
      source_id: z.string().describe("The id of the verified experience this entry comes from"),
      organisation: z.string(),
      title: z.string(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  skills: z.array(z.string()).describe("Only skills from the verified skill list, most relevant first"),
  keywords_matched: z.array(z.string()).describe("Job-ad keywords the CV now covers truthfully"),
  keywords_missing: z.array(z.string()).describe("Job-ad keywords the candidate cannot truthfully claim"),
  change_log: z.array(z.string()).describe("What was reworded, reordered or dropped, and why"),
  cover_letter: z.string(),
});
export type TailoredCv = z.infer<typeof TailoredCvSchema>;

/** A job post pasted from LinkedIn, Instagram, Facebook, WhatsApp, etc. Every field must come from the post. */
export const ExtractedListingSchema = z.object({
  is_job_post: z.boolean().describe("False if the text is not a job or internship opening"),
  company: z.string().nullable().describe("The hiring company's name exactly as written, or null if not named"),
  title: z.string().nullable().describe("The role title as written"),
  location: z.string().nullable().describe("City / remote as written, or null"),
  apply_link: z
    .string()
    .nullable()
    .describe("The application URL or email copied character-for-character from the post, or null if there is none"),
  pay_quote: z.string().nullable().describe("The exact words stating salary, CTC or stipend, copied verbatim, or null"),
  qualifications_quote: z
    .string()
    .nullable()
    .describe("One exact sentence or line from the post stating required qualifications, skills or experience, or null"),
});
export type ExtractedListing = z.infer<typeof ExtractedListingSchema>;

/** What the user wants, read from their own words during onboarding. They confirm it before it's saved. */
export const IntakeSchema = z.object({
  career_stage: z.enum(["student", "fresher", "experienced"]).nullable(),
  experience_years: z.number().nullable().describe("Only if stated or clearly implied by dates they gave"),
  target_roles: z.array(z.string()).describe("Role titles they want, in common job-ad wording"),
  domains: z.array(z.string()).describe("Industries or fields they mention"),
  skills: z.array(z.string()).describe("Skills they say they have"),
  preferred_cities: z.array(z.string()).describe("Indian cities they want to work in"),
  open_to_relocate: z.boolean().nullable(),
  remote_preference: z.enum(["remote", "hybrid", "onsite", "any"]).nullable(),
  job_types: z.array(z.enum(["full_time", "internship", "part_time", "contract", "apprenticeship"])),
  expected_pay_min_inr_annual: z
    .number()
    .nullable()
    .describe("Minimum pay they want, as annual INR. Convert LPA (x100000) and monthly stipends (x12)"),
  notice_period_days: z.number().nullable(),
  deal_breakers: z.array(z.string()).describe("Things they will not accept, in short phrases, e.g. 'service bond'"),
});
export type Intake = z.infer<typeof IntakeSchema>;
