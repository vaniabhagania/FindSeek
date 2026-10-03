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
