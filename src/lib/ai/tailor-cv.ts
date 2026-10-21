import { structuredCall } from "./client";
import { checkForFabrication } from "./guard";
import { jobToPrompt, profileToPrompt, type JobForPrompt, type VerifiedProfile } from "./profile-context";
import { TailoredCvSchema, type TailoredCv } from "./schemas";

const SYSTEM = `You tailor a candidate's CV and cover letter to one job ad.

Hard rules (a violation makes the output unusable):
1. Use ONLY facts in <candidate_profile>. Never invent employers, titles, dates, degrees,
   skills, tools, numbers, or achievements. Never inflate scope or seniority.
2. Every experience entry must carry the source_id of the verified experience it comes from,
   with organisation, title and dates copied exactly.
3. You may: reorder entries and bullets by relevance, reword bullets to mirror the ad's
   vocabulary where it is truthful, merge or drop less relevant bullets, and drop whole entries.
4. A number may appear in a bullet only if the same number appears in that experience's source bullets.
5. Skills must come from the verified skills list.
6. If the ad asks for something the candidate lacks, list it in keywords_missing; do not paper over it.

Quality bar (what gets candidates past screening and recruiters):
- Lead each bullet with an action and outcome; keep bullets to one or two lines.
- Mirror the ad's exact terminology for skills the candidate genuinely has (ATS keyword match).
- Prefer specific, personal detail over generic phrasing; recruiters reject CVs that read as AI-generated.
- Summary: 2-3 sentences aimed at this role. Cover letter: under 250 words, specific to this company and role,
  plain and confident, no clichés.
- Indian hiring conventions: keep it to one page for students and freshers and two at most otherwise.
  If looking_for.career_stage is student or fresher, lead with projects, internships and education.
  Never add a photo, date of birth, gender, marital status, religion or father's name, even though
  older Indian CV templates include them; they invite bias and are not evidence of fit.
- change_log: one line per meaningful change, so the candidate can review what you did.`;

export interface TailorOutput {
  cv: TailoredCv;
  warnings: string[];
}

export async function tailorCv(profile: VerifiedProfile, job: JobForPrompt): Promise<TailorOutput> {
  const cv = await structuredCall({
    schema: TailoredCvSchema,
    system: SYSTEM,
    effort: "high",
    content: [
      { type: "text", text: `<candidate_profile>\n${profileToPrompt(profile)}\n</candidate_profile>` },
      { type: "text", text: jobToPrompt(job) },
    ],
  });
  return { cv, warnings: checkForFabrication(profile, cv) };
}
