import type { NormalizedJob } from "./types";

// Cheap, explainable red flags. Flagged jobs are shown with a warning, not hidden.
const RULES: { flag: string; test: RegExp }[] = [
  { flag: "Asks for an upfront fee or deposit", test: /(registration|training|processing|application)\s+fee|pay (a|the) deposit|upfront payment/i },
  { flag: "Asks to move the conversation to a messaging app", test: /(telegram|whatsapp|signal)\s+(me|us|interview|chat)/i },
  { flag: "Requests bank or ID details before an interview", test: /(bank account|social security|passport) (number|details).{0,40}(before|to apply|to proceed)/i },
  { flag: "Promises unrealistic pay for little work", test: /earn \$?\d{3,}[,\d]* (per|a) (day|week) from home|no experience.{0,30}\$\d{4,}/i },
  { flag: "Uses a personal email address to apply", test: /apply.{0,40}@(gmail|yahoo|hotmail|outlook)\.com/i },
];

export function scamFlags(job: Pick<NormalizedJob, "description" | "title">): string[] {
  const text = `${job.title}\n${job.description}`;
  return RULES.filter((r) => r.test.test(text)).map((r) => r.flag);
}
