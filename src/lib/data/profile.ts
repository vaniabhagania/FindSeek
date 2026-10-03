import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerifiedProfile } from "@/lib/ai/profile-context";

/** DB dates are YYYY-MM-DD; CVs and prompts use YYYY-MM. */
export const toMonth = (d: string | null) => (d ? d.slice(0, 7) : null);
export const fromMonth = (m: string | null) => (m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : null);

/** Loads only the facts the user has confirmed: the sole input to matching and tailoring. */
export async function loadVerifiedProfile(supabase: SupabaseClient, userId: string): Promise<VerifiedProfile> {
  const [{ data: profile }, { data: experiences }, { data: skills }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("experiences").select("*").eq("user_id", userId).eq("confirmed", true).order("start_date", { ascending: false }),
    supabase.from("skills").select("name").eq("user_id", userId).eq("confirmed", true),
  ]);

  return {
    full_name: profile?.full_name ?? null,
    headline: profile?.headline ?? null,
    location: profile?.location ?? null,
    target_roles: profile?.target_roles ?? [],
    domains: profile?.domains ?? [],
    experiences: (experiences ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      organisation: e.organisation,
      title: e.title,
      start_date: toMonth(e.start_date),
      end_date: toMonth(e.end_date),
      bullets: e.bullets ?? [],
    })),
    skills: (skills ?? []).map((s) => s.name),
  };
}

/** Cheap keyword pre-filter so we only spend AI calls on plausible jobs. */
export function keywordScore(profile: VerifiedProfile, job: { title: string; description: string }): number {
  const haystack = `${job.title} ${job.description}`.toLowerCase();
  const terms = [...profile.target_roles, ...profile.skills, ...profile.domains]
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 1);
  const titleHit = profile.target_roles.some((r) => job.title.toLowerCase().includes(r.toLowerCase())) ? 5 : 0;
  return titleHit + terms.filter((t) => haystack.includes(t)).length;
}

export async function logAiAction(
  supabase: SupabaseClient,
  entry: { user_id: string; action: string; model: string; input_ref?: string; output_summary?: string },
) {
  await supabase.from("ai_audit_log").insert(entry);
}
