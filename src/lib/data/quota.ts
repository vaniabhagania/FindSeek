import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { DAILY_LIMITS, type LimitedAction } from "@/lib/limits";
import { noticeUrl, type NoticeCode } from "@/lib/notices";

const LIMIT_NOTICE: Record<LimitedAction, NoticeCode> = {
  bring_job: "limit_bring",
  read_intake: "limit_intake",
  parse_cv: "limit_cv",
  find_matches: "limit_match",
  tailor_cv: "limit_tailor",
};

/**
 * Takes one unit of today's allowance for a paid AI action, or sends the person back to `backTo`
 * with a plain explanation. Call it after the cheap checks (consent, input size) and before the model
 * is called. If the counter can't be reached, the action stops rather than running without a limit.
 */
export async function requireQuota(supabase: SupabaseClient, action: LimitedAction, backTo: string): Promise<void> {
  const { data, error } = await supabase.rpc("take_ai_quota", { p_action: action, p_limit: DAILY_LIMITS[action] });
  if (error) {
    console.error("take_ai_quota failed", error.message);
    redirect(noticeUrl(backTo, "limit_error"));
  }
  if (data !== true) redirect(noticeUrl(backTo, LIMIT_NOTICE[action]));
}
