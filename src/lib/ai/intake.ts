import { normaliseCity } from "@/lib/india/location";
import { structuredCall } from "./client";
import { IntakeSchema, type Intake } from "./schemas";

const SYSTEM = `A job seeker in India describes, in their own words, what they are looking for. Turn it into
structured preferences. Record only what they said or clearly implied; leave everything else null or empty.
Indian usage: "LPA" means lakhs per annum (1 LPA = 100000 INR a year); stipends are usually monthly;
"notice period" is how long before they can join; "fresher" means a recent graduate with no full-time job.
Never infer or record age, gender, religion, caste, marital status, health or family details, even if mentioned.`;

export async function readIntake(text: string): Promise<Intake> {
  const intake = await structuredCall({
    schema: IntakeSchema,
    system: SYSTEM,
    effort: "low",
    maxTokens: 3000,
    content: [{ type: "text", text: `<in_their_words>\n${text.slice(0, 6000)}\n</in_their_words>` }],
  });
  return {
    ...intake,
    // Keep city names canonical so they match job listings ("Bangalore" -> "Bengaluru").
    preferred_cities: [...new Set(intake.preferred_cities.map((c) => normaliseCity(c) ?? c.trim()).filter(Boolean))],
  };
}
