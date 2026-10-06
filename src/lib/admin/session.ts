import type { SupabaseClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/supabase/server";

export interface EmployerContext {
  id: string;
  name: string;
  role: "owner" | "recruiter";
}

/**
 * The signed-in user and, if they act for an employer, which one. Used by admin pages and actions.
 * Membership is read through the user's own session, so row level security decides what they see.
 */
export async function getRecruiter(): Promise<{
  supabase: SupabaseClient | null;
  user: { id: string; email?: string } | null;
  employer: EmployerContext | null;
}> {
  const { supabase, user } = await getUser();
  if (!supabase || !user) return { supabase: null, user: null, employer: null };

  const { data } = await supabase
    .from("employer_members")
    .select("role, employers(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const employers = data?.employers as { id: string; name: string } | { id: string; name: string }[] | null | undefined;
  const employer = Array.isArray(employers) ? employers[0] : employers;
  return {
    supabase,
    user: { id: user.id, email: user.email },
    employer: data && employer ? { id: employer.id, name: employer.name, role: data.role } : null,
  };
}
