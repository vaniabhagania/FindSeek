import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "./proxy";

// With no database connected, a deployed site must not open the signed-in screens to strangers.
// (These tests run without Supabase keys, which is the state of a site whose variables are not set.)

const get = (path: string) => updateSession(new NextRequest(`https://findseek.example${path}`));
afterEach(() => vi.unstubAllEnvs());

describe("signed-in areas on a site with no database connected", () => {
  it.each(["/dashboard", "/jobs", "/jobs/abc", "/profile", "/tracker", "/settings", "/admin", "/admin/posts/new", "/ops/reports"])(
    "sends a visitor from %s to sign-in in production",
    async (path) => {
      vi.stubEnv("NODE_ENV", "production");
      const res = await get(path);
      expect(res.status).toBe(307);
      const to = new URL(res.headers.get("location")!);
      expect(to.pathname).toBe("/login");
      expect(to.searchParams.get("next")).toBe(path);
    },
  );

  it("keeps the next path and drops any query a visitor added", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await get("/jobs?error=Pay%20%E2%82%B92000&x=1");
    const to = new URL(res.headers.get("location")!);
    expect([...to.searchParams.keys()]).toEqual(["next"]);
  });

  it.each(["/", "/login", "/robots.txt"])("leaves the public page %s alone", async (path) => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await get(path);
    expect(res.headers.get("location")).toBeNull();
  });

  it("opens the screens while building, so they can be worked on without keys", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await get("/dashboard");
    expect(res.headers.get("location")).toBeNull();
  });
});
