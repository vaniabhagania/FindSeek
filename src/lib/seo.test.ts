import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { CRAWLER_SKIP, PRIVATE_PAGE } from "./seo";

describe("what search engines are told", () => {
  it("lets the landing page be crawled and keeps crawlers out of the app", () => {
    const rules = robots().rules as { allow: string; disallow: string[] };
    expect(rules.allow).toBe("/");
    for (const p of ["/api/", "/dashboard", "/jobs", "/admin", "/settings", "/login"]) expect(rules.disallow).toContain(p);
  });

  it("does not announce the operator review area", () => {
    expect(JSON.stringify(robots())).not.toMatch(/ops/i);
    expect(CRAWLER_SKIP.join(" ")).not.toMatch(/ops/i);
  });

  it("marks private pages as not to be indexed", () => {
    expect(PRIVATE_PAGE.robots).toEqual({ index: false, follow: false });
  });
});
