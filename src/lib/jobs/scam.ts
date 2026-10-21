import type { NormalizedJob } from "./types";

// Cheap, explainable red flags, including the patterns behind most fake job offers in India
// (registration or "security" deposits, WhatsApp-only hiring, pay-to-get-an-offer-letter,
// typing / data-entry work-from-home schemes). A flagged listing fails verification.
const RULES: { flag: string; test: RegExp }[] = [
  { flag: "Asks for an upfront fee or deposit", test: /(registration|training|processing|application|joining|onboarding|kit|laptop|verification|document(ation)?)\s+(fee|charges?)|(security|refundable|caution)\s+(deposit|amount)|pay (a|the) deposit|upfront payment|pay (rs\.?|₹|inr)\s*\d/i },
  { flag: "Charges for an offer letter or interview", test: /(offer letter|interview|appointment letter)[^.\n]{0,30}(fee|charges?|payment)|pay[^.\n]{0,20}(for|to get) (the |your )?(offer|appointment) letter/i },
  { flag: "Hires only through a messaging app", test: /(telegram|whatsapp|signal)\s+(me|us|interview|chat)|(interview|hiring|contact|apply)[^.\n]{0,25}(on|via|through) (whatsapp|telegram)|whatsapp (only|number|no\.?)\s*[:-]?\s*(\+91)?\s*\d/i },
  { flag: "Requests bank or ID details before an interview", test: /(bank account|social security|passport|aadhaar|aadhar|pan card)( number| details| card)?.{0,40}(before|to apply|to proceed|to confirm)/i },
  { flag: "Promises unrealistic pay for little work", test: /earn (\$|₹|rs\.?\s?)?\d{3,}[,\d]* (per|a|daily|every) (day|week)|earn (up to )?(₹|rs\.?\s?)\d[\d,]* (daily|per day) from home|no experience.{0,30}(\$\d{4,}|₹\s?\d{2},?\d{3,})|(simple|easy) (typing|copy[- ]paste|form filling|data entry) (job|work)/i },
  { flag: "No interview, direct joining", test: /\b(no interview|without interview|direct (joining|selection))\b/i },
  { flag: "Uses a personal email address to apply", test: /(apply|send|mail|share)[^.\n]{0,40}@(gmail|yahoo|hotmail|outlook|rediffmail)\.(com|in|co\.in)/i },
];

export function scamFlags(job: Pick<NormalizedJob, "description" | "title">): string[] {
  const text = `${job.title}\n${job.description}`;
  return RULES.filter((r) => r.test.test(text)).map((r) => r.flag);
}
