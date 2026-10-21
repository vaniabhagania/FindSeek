import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { env } from "@/lib/env";
import { createServiceClient, getUser } from "@/lib/supabase/server";
import { isOperatorEmail, parseOperators } from "./operators";

/**
 * The signed-in user, if they are on the operator list and their email is confirmed. Everything that
 * lets someone act on other people's reports calls this first: the page and the action each check on
 * their own, because a page check does not protect an action that can be called directly.
 */
export async function getOperator(): Promise<{ user: { id: string; email: string }; admin: SupabaseClient } | null> {
  // Whether someone is an operator depends on who is asking, never on build-time settings. Without this,
  // a build with no operator list read no cookies, so Next saved the section as one fixed "not found" page.
  await connection();
  const operators = parseOperators(env.operatorEmails);
  if (!operators.length) return null;
  const { supabase, user } = await getUser();
  if (!supabase || !user || !user.email_confirmed_at || !isOperatorEmail(user.email, operators)) return null;
  const admin = createServiceClient();
  return admin ? { user: { id: user.id, email: user.email! }, admin } : null;
}
