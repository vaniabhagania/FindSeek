import type { VerifiedProfile } from "./profile-context";
import type { TailoredCv } from "./schemas";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const numbersIn = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

/**
 * Deterministic check that a tailored CV only uses verified facts. Returns
 * human-readable warnings; any warning blocks one-click approval in the UI.
 */
export function checkForFabrication(profile: VerifiedProfile, cv: TailoredCv): string[] {
  const warnings: string[] = [];
  const byId = new Map(profile.experiences.map((e) => [e.id, e]));
  const verifiedSkills = new Set(profile.skills.map(norm));

  for (const entry of cv.experiences) {
    const source = byId.get(entry.source_id);
    if (!source) {
      warnings.push(`"${entry.title}" at ${entry.organisation} does not match any verified experience.`);
      continue;
    }
    if (norm(entry.organisation) !== norm(source.organisation)) {
      warnings.push(`Organisation changed: "${source.organisation}" became "${entry.organisation}".`);
    }
    if (norm(entry.title) !== norm(source.title)) {
      warnings.push(`Job title changed at ${source.organisation}: "${source.title}" became "${entry.title}".`);
    }
    if ((entry.start_date ?? null) !== (source.start_date ?? null) || (entry.end_date ?? null) !== (source.end_date ?? null)) {
      warnings.push(`Dates changed for ${source.title} at ${source.organisation}.`);
    }
    const sourceNumbers = new Set(source.bullets.flatMap(numbersIn));
    for (const bullet of entry.bullets) {
      const invented = numbersIn(bullet).filter((n) => !sourceNumbers.has(n));
      if (invented.length) {
        warnings.push(`New figure${invented.length > 1 ? "s" : ""} ${invented.join(", ")} at ${source.organisation}: "${bullet}"`);
      }
    }
  }

  for (const skill of cv.skills) {
    if (!verifiedSkills.has(norm(skill))) warnings.push(`Skill not in your verified list: "${skill}".`);
  }
  return warnings;
}
