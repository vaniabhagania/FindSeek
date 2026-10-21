import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { createServiceClient, getUser } from "@/lib/supabase/server";
import { isOperatorEmail, parseOperators } from "./operators";

/**
 * The signed-in user, if they are on the operator list and their email is confirmed. Everything that
 * lets someone act on other people's reports calls this first: the page and the action each check on
 * their own, because a page check does not protect an action that can be called directly.
 */
export async function getOperator(): Promise<{ user: { id: string; email: string }; admin: SupabaseClient } | null> {
  const operators = parseOperators(env.operatorEmails);
  if (!operators.length) return null;
  const { supabase, user } = await getUser();
  if (!supabase || !user || !user.email_confirmed_at || !isOperatorEmail(user.email, operators)) return null;
  const admin = createServiceClient();
  return admin ? { user: { id: user.id, email: user.email! }, admin } : null;
}
