// Pulls the hard facts candidates filter on out of free-text ads:
// experience range, notice period, job type and whether qualifications are stated at all.

import { MAX_PARSE_CHARS } from "@/lib/limits";

export interface ExperienceRange { min: number; max: number | null }

// Whitespace between the parts of a phrase is capped at a few characters. An unbounded `\s*` makes a
// pattern re-read a long run of spaces or newlines from every starting point, which is how one junk
// post could tie the server up for seconds.
export function parseExperience(input: string): ExperienceRange | null {
  const text = input.length > MAX_PARSE_CHARS ? input.slice(0, MAX_PARSE_CHARS) : input;
  if (/\b(freshers?( can| are)? (apply|welcome)|no (prior )?experience (required|needed)|0\s{0,3}(?:-|–|to)\s{0,3}1\s{0,3}(years?|yrs?))\b/i.test(text)) {
    return { min: 0, max: 1 };
  }
  const range = text.match(/(?<![\d.])(\d{1,2})(?:\.\d)?\s{0,3}(?:-|–|to)\s{0,3}(\d{1,2})(?:\.\d)?\s{0,3}\+?\s{0,3}(?:years?|yrs?)/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (max >= min && max <= 40) return { min, max };
  }
  const atLeast = text.match(/(?<![\d.])(\d{1,2})\s{0,3}\+?\s{0,3}(?:years?|yrs?)(?:'|’)?(?:\s{1,3}of)?\s{1,3}(?:relevant\s{1,3}|professional\s{1,3}|hands-on\s{1,3}|industry\s{1,3}|work\s{1,3})?(?:experience|exp)/i);
  if (atLeast) return { min: Number(atLeast[1]), max: null };
  return null;
}

/** Longest notice period the employer will accept, in days. 0 = immediate joiners only. */
export function parseNoticeLimit(input: string): number | null {
  const text = input.length > MAX_PARSE_CHARS ? input.slice(0, MAX_PARSE_CHARS) : input;
  if (/\bimmediate joiners? (only|required|preferred)\b|\bjoin immediately\b/i.test(text)) return 0;
  const m = text.match(/notice period[^.\n]{0,40}?(?:of\s+)?(?:max(?:imum)?\s+|up to\s+|upto\s+|less than\s+|within\s+|<\s*)?(\d{1,3})\s{0,3}days/i)
    ?? text.match(/(\d{1,3})\s{0,3}days?(?:'|’)?\s{1,3}notice/i)
    ?? text.match(/(?:serving|can join within|joining within)\s{1,3}(\d{1,3})\s{0,3}days/i);
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

// What a requirement can be about. A real ad names more than one kind (a degree and some years, or a
// degree and a skill); the same kind said again, or a lone keyword, is not a list of requirements.
const QUAL_KINDS: RegExp[] = [
  // Education. "BE" is only a degree when written B.E. or in capitals next to other degrees, never the word "be".
  /\b(?:b\.?\s?tech|m\.?\s?tech|mca|bca|b\.?\s?sc|m\.?\s?sc|mba|bachelor('|’)?s|master('|’)?s|degree|graduate|diploma)\b/i,
  /\b(?:B\.\s?E\b|BE\b(?=\s*[/,&(]|\s+(?:in|or|and|degree)\b))/,
  // Years of experience.
  /\b\d+\+?\s*(?:years?|yrs?)\b/i,
  // Experience in something.
  /\bexperience (?:with|in)\b/i,
  // A named skill.
  /\b(?:proficien(?:t|cy) in|knowledge of|familiar(?:ity)? with)\b/i,
];

/** Does the ad actually say what it takes to get the job? */
export function statesQualifications(input: string): { ok: boolean; detail: string } {
  const text = input.length > MAX_PARSE_CHARS ? input.slice(0, MAX_PARSE_CHARS) : input;
  const heading = text.match(QUAL_HEADINGS);
  // Education counts once, whether it is written B.Tech or B.E.
  const kinds = new Set<string>();
  if (QUAL_KINDS[0].test(text) || QUAL_KINDS[1].test(text)) kinds.add("education");
  if (QUAL_KINDS[2].test(text)) kinds.add("years");
  if (QUAL_KINDS[3].test(text)) kinds.add("experience");
  if (QUAL_KINDS[4].test(text)) kinds.add("skill");
  if (heading && kinds.size >= 2) return { ok: true, detail: `Has a "${heading[0]}" section` };
  if (kinds.size >= 3) return { ok: true, detail: "Lists degree, skill or experience requirements" };
  return { ok: false, detail: "Doesn't say what qualifications or skills are needed" };
}
