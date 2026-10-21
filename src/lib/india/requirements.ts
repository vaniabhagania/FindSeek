// Pulls the hard facts candidates filter on out of free-text ads:
// experience range, notice period, job type and whether qualifications are stated at all.

export interface ExperienceRange { min: number; max: number | null }

export function parseExperience(text: string): ExperienceRange | null {
  if (/\b(freshers?( can| are)? (apply|welcome)|no (prior )?experience (required|needed)|0\s*(?:-|–|to)\s*1\s*(years?|yrs?))\b/i.test(text)) {
    return { min: 0, max: 1 };
  }
  const range = text.match(/(\d{1,2})(?:\.\d)?\s*(?:-|–|to)\s*(\d{1,2})(?:\.\d)?\s*\+?\s*(?:years?|yrs?)/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (max >= min && max <= 40) return { min, max };
  }
  const atLeast = text.match(/(?:minimum|min\.?|at least)?\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:'|’)?(?:\s+of)?\s+(?:relevant\s+|professional\s+|hands-on\s+|industry\s+|work\s+)?(?:experience|exp)/i);
  if (atLeast) return { min: Number(atLeast[1]), max: null };
  return null;
}

/** Longest notice period the employer will accept, in days. 0 = immediate joiners only. */
export function parseNoticeLimit(text: string): number | null {
  if (/\bimmediate joiners? (only|required|preferred)\b|\bjoin immediately\b/i.test(text)) return 0;
  const m = text.match(/notice period[^.\n]{0,40}?(?:of\s+)?(?:max(?:imum)?\s+|up to\s+|upto\s+|less than\s+|within\s+|<\s*)?(\d{1,3})\s*days/i)
    ?? text.match(/(\d{1,3})\s*days?(?:'|’)? notice/i)
    ?? text.match(/(?:serving|can join within|joining within)\s+(\d{1,3})\s*days/i);
  return m ? Number(m[1]) : null;
}

export type JobType = "internship" | "full_time" | "part_time" | "contract" | "apprenticeship";

export function parseJobType(title: string, text: string): JobType {
  const t = `${title}\n${text.slice(0, 2500)}`.toLowerCase();
  if (/\bintern(ship)?\b/.test(title.toLowerCase()) || /\binternship\b/.test(t)) return "internship";
  if (/\bapprentice(ship)?\b/.test(t)) return "apprenticeship";
  if (/\b(contract(ual)?|freelance|fixed[- ]term)\b/.test(title.toLowerCase())) return "contract";
  if (/\bpart[- ]time\b/.test(t)) return "part_time";
  return "full_time";
}

const QUAL_HEADINGS = /\b(qualifications?|requirements?|what you('|’)ll need|what we('|’)re looking for|who you are|you (have|bring|should have)|must[- ]haves?|skills required|eligibility( criteria)?|desired (skills|profile)|minimum qualifications|about you)\b/i;
const QUAL_SIGNALS = /\b(b\.?\s?tech|b\.?\s?e\.?|m\.?\s?tech|mca|bca|b\.?\s?sc|m\.?\s?sc|mba|bachelor('|’)?s|master('|’)?s|degree|graduate|diploma|\d+\+?\s*(years?|yrs?)|proficien(t|cy) in|experience (with|in)|knowledge of|familiar(ity)? with)\b/i;

/** Does the ad actually say what it takes to get the job? */
export function statesQualifications(text: string): { ok: boolean; detail: string } {
  const heading = text.match(QUAL_HEADINGS);
  const signals = text.match(new RegExp(QUAL_SIGNALS.source, "gi")) ?? [];
  if (heading && signals.length >= 1) return { ok: true, detail: `Has a "${heading[0]}" section` };
  if (signals.length >= 3) return { ok: true, detail: "Lists degree, skill or experience requirements" };
  return { ok: false, detail: "Doesn't say what qualifications or skills are needed" };
}
