import { createServiceClient } from "@/lib/supabase/server";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * How much is live and how much was turned away, shown before anyone signs up for
 * anything. Counts only; no listing data leaves the server this way.
 */
export async function feedCoverage(): Promise<{ live: number; heldThisWeek: number } | null> {
  const admin = createServiceClient();
  if (!admin) return null;
  const weekAgo = new Date(Date.now() - WEEK).toISOString();
  const [live, held] = await Promise.all([
    admin.from("jobs").select("id", { count: "exact", head: true })
      .eq("verification_status", "verified").neq("source", "user_submitted").is("closed_at", null),
    admin.from("jobs").select("id", { count: "exact", head: true })
      .eq("verification_status", "held").neq("source", "user_submitted").gte("fetched_at", weekAgo),
  ]);
  if (live.error || held.error) return null;
  return { live: live.count ?? 0, heldThisWeek: held.count ?? 0 };
}
