import { beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_LIMITS, type LimitedAction } from "@/lib/limits";
import { noticeMessage } from "@/lib/notices";

// redirect() throws in Next.js; do the same here so the code after it never runs.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { requireQuota } from "./quota";

const client = (result: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(result);
  return { supabase: { rpc } as never, rpc };
};

describe("daily AI limits", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

  it("lets the action run while there is allowance left", async () => {
    const { supabase, rpc } = client({ data: true, error: null });
    await expect(requireQuota(supabase, "tailor_cv", "/jobs/1")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("take_ai_quota", { p_action: "tailor_cv", p_limit: DAILY_LIMITS.tailor_cv });
  });

  it("sends the person back with a plain message once the limit is used", async () => {
    const { supabase } = client({ data: false, error: null });
    await expect(requireQuota(supabase, "tailor_cv", "/jobs/1")).rejects.toThrow("REDIRECT /jobs/1?error=limit_tailor");
  });

  it("stops, rather than running without a limit, when the counter can't be reached", async () => {
    const { supabase } = client({ data: null, error: { message: "function does not exist" } });
    await expect(requireQuota(supabase, "bring_job", "/jobs/add")).rejects.toThrow("REDIRECT /jobs/add?error=limit_error");
  });

  it("treats anything but an explicit true as a refusal", async () => {
    for (const data of [null, undefined, 0, 1, "true"]) {
      const { supabase } = client({ data, error: null });
      await expect(requireQuota(supabase, "find_matches", "/jobs")).rejects.toThrow("limit_match");
    }
  });

  it("keeps the return path when it already has a query", async () => {
    const { supabase } = client({ data: false, error: null });
    await expect(requireQuota(supabase, "parse_cv", "/onboarding?step=cv")).rejects.toThrow("REDIRECT /onboarding?step=cv&error=limit_cv");
  });

  it("has a message and a sensible limit for every limited action", () => {
    const codes: Record<LimitedAction, string> = {
      bring_job: "limit_bring",
      read_intake: "limit_intake",
      parse_cv: "limit_cv",
      find_matches: "limit_match",
      tailor_cv: "limit_tailor",
    };
    for (const action of Object.keys(DAILY_LIMITS) as LimitedAction[]) {
      expect(noticeMessage(codes[action])).toBeTruthy();
      expect(DAILY_LIMITS[action]).toBeGreaterThanOrEqual(1);
      expect(DAILY_LIMITS[action]).toBeLessThanOrEqual(1000); // the database refuses higher
    }
    expect(noticeMessage("limit_error")).toBeTruthy();
  });
});
