import { structuredCall } from "./client";
import { jobToPrompt, profileToPrompt, type JobForPrompt, type VerifiedProfile } from "./profile-context";
import { MatchSchema, type Match } from "./schemas";

const SYSTEM = `You assess how well a candidate's verified profile fits a job ad.
Score honestly from 0 to 100: 80+ means they meet nearly all hard requirements; 50-79 means a
credible stretch; below 50 means key requirements are missing.
Judge only job-relevant evidence. Ignore and never infer age, gender, ethnicity, nationality,
religion, disability, marital or family status, or any other protected characteristic.
Strengths and gaps must cite concrete requirements from the ad.`;

export async function scoreMatch(profile: VerifiedProfile, job: JobForPrompt): Promise<Match> {
  const result = await structuredCall({
    schema: MatchSchema,
    system: SYSTEM,
    effort: "low",
    maxTokens: 4000,
    content: [
      { type: "text", text: `<candidate_profile>\n${profileToPrompt(profile)}\n</candidate_profile>` },
      { type: "text", text: jobToPrompt(job) },
    ],
  });
  return { ...result, score: Math.max(0, Math.min(100, Math.round(result.score))) };
}
