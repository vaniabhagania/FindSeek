// India-first location handling: city aliases, "is this in India", and whether a
// remote role is actually open to someone living in India.

import { MAX_PARSE_CHARS } from "@/lib/limits";

/** Canonical city name -> spellings seen in job ads. Order matters only for display. */
export const INDIAN_CITIES: Record<string, string[]> = {
  "Bengaluru": ["bengaluru", "bangalore", "blr"],
  "Mumbai": ["mumbai", "bombay", "navi mumbai", "thane"],
  "Delhi NCR": ["delhi", "new delhi", "ncr", "delhi ncr"],
  "Gurugram": ["gurugram", "gurgaon"],
  "Noida": ["noida", "greater noida"],
  "Hyderabad": ["hyderabad", "secunderabad", "hitec city"],
  "Pune": ["pune", "pimpri", "hinjewadi"],
  "Chennai": ["chennai", "madras"],
  "Kolkata": ["kolkata", "calcutta"],
  "Ahmedabad": ["ahmedabad", "gandhinagar", "gift city"],
  "Kochi": ["kochi", "cochin", "kakkanad"],
  "Thiruvananthapuram": ["thiruvananthapuram", "trivandrum", "technopark"],
  "Coimbatore": ["coimbatore"],
  "Jaipur": ["jaipur"],
  "Chandigarh": ["chandigarh", "mohali", "panchkula"],
  "Indore": ["indore"],
  "Bhubaneswar": ["bhubaneswar"],
  "Nagpur": ["nagpur"],
  "Lucknow": ["lucknow"],
  "Visakhapatnam": ["visakhapatnam", "vizag"],
  "Mysuru": ["mysuru", "mysore"],
  "Mangaluru": ["mangaluru", "mangalore"],
  "Vadodara": ["vadodara", "baroda"],
  "Surat": ["surat"],
  "Bhopal": ["bhopal"],
  "Goa": ["goa", "panaji"],
};

const STATES = [
  "karnataka", "maharashtra", "telangana", "tamil nadu", "kerala", "gujarat", "haryana",
  "uttar pradesh", "west bengal", "rajasthan", "punjab", "odisha", "madhya pradesh", "andhra pradesh",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CITY_PATTERNS = Object.entries(INDIAN_CITIES).map(([city, aliases]) => ({
  city,
  re: new RegExp(`\\b(${aliases.map(escape).join("|")})\\b`, "i"),
}));

/** Canonical Indian cities mentioned in a location string, e.g. "Bangalore / Gurgaon" -> [Bengaluru, Gurugram]. */
export function indianCitiesIn(text: string | null | undefined): string[] {
  if (!text) return [];
  return CITY_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.city);
}

export function normaliseCity(input: string): string | null {
  return indianCitiesIn(input)[0] ?? null;
}

export function isIndianLocation(text: string | null | undefined): boolean {
  if (!text) return false;
  if (/\bindia\b|\bbharat\b/i.test(text)) return true;
  if (indianCitiesIn(text).length) return true;
  return STATES.some((s) => new RegExp(`\\b${s}\\b`, "i").test(text));
}

export type WorkMode = "remote" | "hybrid" | "onsite";

export function workModeOf(location: string | null, description: string, remoteFlag: boolean | null): WorkMode | null {
  const text = `${location ?? ""}\n${description.slice(0, 3000)}`.toLowerCase();
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (remoteFlag || /\b(fully remote|remote[- ]first|work from home|wfh)\b/.test(text) || /\bremote\b/.test(location?.toLowerCase() ?? "")) return "remote";
  if (/\b(on-?site|in[- ]office|work from office|wfo)\b/.test(text)) return "onsite";
  return null;
}

export type Eligibility = { status: "eligible" | "not_eligible" | "unclear"; reason: string };

// Phrases that lock a role to a country or region other than India.
const RESTRICTIONS: { re: RegExp; reason: string }[] = [
  { re: /\b(us|u\.s\.|usa|united states|canada|uk|u\.k\.|united kingdom|eu|europe|emea|latam|germany|australia)[- ]?(only|based)\b/i, reason: "Limited to candidates in another country or region" },
  { re: /\bmust (be|reside|live) (based |located )?in (the )?(us|u\.s\.|usa|united states|canada|uk|united kingdom|eu|europe|germany|australia)\b/i, reason: "Must live outside India" },
  { re: /\b(authori[sz]ed|eligible|legally able) to work in (the )?(us|u\.s\.|usa|united states|canada|uk|united kingdom|eu|european union|australia)\b/i, reason: "Needs work authorisation in another country" },
  { re: /\bright to work in the (uk|united kingdom)\b/i, reason: "Needs UK right to work" },
  { re: /\b(security clearance|us citizen(ship)?|green card)\b/i, reason: "Needs US citizenship or clearance" },
  { re: /\bremote\s*[-–(,]\s*(us|usa|united states|canada|uk|europe|emea|latam|germany|australia|americas)\b/i, reason: "Remote, but only within another region" },
];

const OPEN_TO_INDIA = /\b(anywhere|worldwide|global(ly)?|any country|apac|asia[- ]pacific|south asia)\b/i;

// Ads that name India only to rule it out: "Worldwide (except India)", "unable to hire candidates in
// India". These run first, because the word "India" would otherwise read as a reason to say yes. Every
// gap is bounded and stops at punctuation, so a long ad cannot make them slow and a sentence like
// "We don't do relocation, but you can work from India" is not swallowed.
const GAP = "[^.!?;,\\n]";
const EXCLUDES_INDIA: RegExp[] = [
  new RegExp(`\\b(?:except(?: for)?|excluding|excl\\.?|other than|apart from|besides|barring|not including)\\s{1,3}(?:the\\s+)?[a-z ,&/]{0,40}?\\bindia\\b`, "i"),
  new RegExp(`\\b(?:unable|cannot|can't|can not|not able|do not|don't|does not|doesn't|will not|won't|are not|aren't|is not|isn't|no longer|not currently|currently not)\\b${GAP}{0,60}?\\b(?:hir\\w*|accept\\w*|consider\\w*|recruit\\w*|sponsor\\w*|support\\w*|employ\\w*|onboard\\w*|open|available|eligible|permitted|allowed)\\b${GAP}{0,40}?\\bindia\\b`, "i"),
  new RegExp(`\\bnot\\s{1,3}(?:currently\\s{1,3})?(?:available|open|eligible|hiring|accepting|supported|permitted|allowed)\\b${GAP}{0,40}?\\bindia\\b`, "i"),
  new RegExp(`\\bindia\\b${GAP}{0,25}?\\b(?:not (?:eligible|supported|available|permitted|allowed|considered|open)|excluded|ineligible|restricted)\\b`, "i"),
  new RegExp(`\\bno\\s{1,3}(?:applicants?|candidates?|applications?|hires?|hiring)\\s{1,3}(?:from|in|based in)\\s{1,3}(?:the\\s+)?india\\b`, "i"),
  new RegExp(`\\b(?:hiring|hire|based|located|residing|living)\\s{1,3}(?:only\\s{1,3})?outside(?: of)?\\s{1,3}india\\b`, "i"),
];
// A clause that turns the refusal around ("..., but candidates in India are welcome") is not a refusal.
const TURNS_AROUND = /\b(but|however|although|though|whereas|instead|apart from that)\b/i;

function rulesOutIndia(text: string): boolean {
  for (const re of EXCLUDES_INDIA) {
    const m = re.exec(text);
    if (!m) continue;
    if (TURNS_AROUND.test(m[0])) continue;
    // "Not open to candidates based outside India" asks for people already in India. If the sentence
    // already said no, the "outside" turns it into a double negative.
    if (/outside/i.test(m[0])) {
      const start = Math.max(0, m.index - 120);
      const lead = text.slice(start, m.index);
      const sentence = lead.slice(Math.max(lead.lastIndexOf("."), lead.lastIndexOf("\n"), lead.lastIndexOf(";")) + 1) + m[0];
      const upToOutside = sentence.slice(0, sentence.search(/outside/i));
      if (/\b(not|no|never|non|cannot|can't)\b/i.test(upToOutside)) continue;
    }
    return true;
  }
  return false;
}

// Clauses that say India is where the hiring happens. They have to sit in one clause with India, so a
// stray "remote" three paragraphs away is not enough.
const HIRES_IN_INDIA = /\b(remote|hire|hiring|hires|based|located|candidates?|applicants?|open to|welcome|openings?|work(?:ing)? from|relocat\w*)\b/i;

// A few aliases ("ncr", "blr", "goa", "thane") turn up in company names and ordinary words, so they
// only count when they come from the location field, not from free text in the description.
const AMBIGUOUS_ALIASES = new Set(["ncr", "blr", "goa", "thane"]);
const OFFICE_CITIES = Object.values(INDIAN_CITIES).flat().filter((a) => !AMBIGUOUS_ALIASES.has(a)).map(escape).join("|");
const OFFICE_IN_CITY = new RegExp(
  `\\b(?:join|work(?:ing)? (?:from|at|in|out of)|based (?:in|at|out of)|located (?:in|at)|relocat\\w+ to|office (?:in|at))\\b${GAP}{0,40}?\\b(${OFFICE_CITIES})\\b`,
  "i",
);

/**
 * Can someone living in India take this job? Remote roles are the main trap: "Remote" on a
 * global board very often means "remote within the US". We only say "eligible" with evidence.
 */
export function indiaEligibility(job: { location: string | null; description: string; country_code?: string | null }): Eligibility {
  const loc = (job.location ?? "").slice(0, 300);
  const description = job.description.length > MAX_PARSE_CHARS ? job.description.slice(0, MAX_PARSE_CHARS) : job.description;
  const text = `${loc}\n${description}`;

  if (rulesOutIndia(text)) return { status: "not_eligible", reason: "The ad rules out candidates in India" };
  if (job.country_code === "in" || isIndianLocation(loc)) return { status: "eligible", reason: "Based in India" };

  const blocked = RESTRICTIONS.find((r) => r.re.test(text));
  if (blocked) return { status: "not_eligible", reason: blocked.reason };

  for (const clause of description.split(/[.!?;\n]+/)) {
    if (/\bindia\b/i.test(clause) && HIRES_IN_INDIA.test(clause)) {
      return { status: "eligible", reason: "The ad says it hires in India" };
    }
  }
  if (!loc.trim()) {
    const office = OFFICE_IN_CITY.exec(description);
    if (office) return { status: "eligible", reason: `The ad puts the office in ${indianCitiesIn(office[1])[0] ?? office[1]}` };
  }
  if (OPEN_TO_INDIA.test(text)) return { status: "eligible", reason: "Open worldwide or across APAC" };
  if (loc && !/\bremote\b/i.test(loc)) return { status: "not_eligible", reason: `Office is in ${loc}` };
  return { status: "unclear", reason: "The ad doesn't say which countries it hires from" };
}
