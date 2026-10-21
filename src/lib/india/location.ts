// India-first location handling: city aliases, "is this in India", and whether a
// remote role is actually open to someone living in India.

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

/**
 * Can someone living in India take this job? Remote roles are the main trap: "Remote" on a
 * global board very often means "remote within the US". We only say "eligible" with evidence.
 */
export function indiaEligibility(job: { location: string | null; description: string; country_code?: string | null }): Eligibility {
  const loc = job.location ?? "";
  if (job.country_code === "in" || isIndianLocation(loc)) return { status: "eligible", reason: "Based in India" };

  const text = `${loc}\n${job.description}`;
  const blocked = RESTRICTIONS.find((r) => r.re.test(text));
  if (blocked) return { status: "not_eligible", reason: blocked.reason };

  if (/\bindia\b/i.test(job.description) && /\b(remote|hire|hiring|based|located)\b/i.test(job.description)) {
    return { status: "eligible", reason: "The ad mentions hiring in India" };
  }
  if (OPEN_TO_INDIA.test(text)) return { status: "eligible", reason: "Open worldwide or across APAC" };
  if (loc && !/\bremote\b/i.test(loc)) return { status: "not_eligible", reason: `Office is in ${loc}` };
  return { status: "unclear", reason: "The ad doesn't say which countries it hires from" };
}
