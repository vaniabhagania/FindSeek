import { describe, expect, it } from "vitest";
import { bearerMatches, isSameOrigin, safeRelativePath } from "./security";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

describe("safeRelativePath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/jobs/abc?tab=saved", "/jobs/abc?tab=saved"],
    ["/profile#cv", "/profile#cv"],
    ["/", "/"],
  ])("keeps %s", (input, out) => {
    expect(safeRelativePath(input, "/home")).toBe(out);
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/\u0000/evil.com",
    "https://evil.com",
    "http://evil.com/dashboard",
    "javascript:alert(1)",
    "evil.com",
    "dashboard",
    "",
    "/" + "a".repeat(600),
  ])("rejects %j", (input) => {
    expect(safeRelativePath(input, "/home")).toBe("/home");
  });

  it("falls back when nothing is given", () => {
    expect(safeRelativePath(null, "/home")).toBe("/home");
    expect(safeRelativePath(undefined, "/home")).toBe("/home");
  });
});

describe("bearerMatches", () => {
  it("accepts only the exact header", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("Bearer s3cret ", "s3cret")).toBe(false);
    expect(bearerMatches("bearer s3cret", "s3cret")).toBe(false);
    expect(bearerMatches("s3cret", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer s3cre", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer " + "x".repeat(10_000), "s3cret")).toBe(false);
  });

  it("never lets anyone in when the secret is not set", () => {
    expect(bearerMatches("Bearer ", "")).toBe(false);
    expect(bearerMatches("Bearer", "")).toBe(false);
    expect(bearerMatches("", "")).toBe(false);
    expect(bearerMatches(null, "")).toBe(false);
    expect(bearerMatches(null, "s3cret")).toBe(false);
  });
});

describe("security headers", () => {
  const names = (h: { key: string }[]) => h.map((x) => x.key);

  it("sends the basics everywhere", () => {
    const h = securityHeaders({ production: false });
    expect(names(h)).toEqual(expect.arrayContaining(["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy"]));
    expect(h.find((x) => x.key === "X-Frame-Options")?.value).toBe("DENY");
  });

  it("leaves the content policy and HSTS to production, where they cannot break hot reload", () => {
    expect(names(securityHeaders({ production: false }))).not.toContain("Content-Security-Policy");
    expect(names(securityHeaders({ production: false }))).not.toContain("Strict-Transport-Security");
    expect(names(securityHeaders({ production: true }))).toEqual(expect.arrayContaining(["Content-Security-Policy", "Strict-Transport-Security"]));
  });

  it("locks framing, forms, plugins and the base tag to this site", () => {
    const csp = contentSecurityPolicy({});
    for (const d of ["default-src 'self'", "frame-ancestors 'none'", "form-action 'self'", "object-src 'none'", "base-uri 'self'"]) {
      expect(csp).toContain(d);
    }
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/\*/);
  });

  it("allows requests to the project's own Supabase address and nothing else", () => {
    expect(contentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co/rest/v1" })).toContain("connect-src 'self' https://abc.supabase.co;");
    expect(contentSecurityPolicy({ supabaseUrl: "javascript:alert(1)" })).toContain("connect-src 'self';");
    expect(contentSecurityPolicy({ supabaseUrl: "not a url" })).toContain("connect-src 'self';");
    expect(contentSecurityPolicy({})).toContain("connect-src 'self';");
  });
});

describe("isSameOrigin", () => {
  const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name.toLowerCase()] ?? null });
  const host = { host: "findseek.example" };

  it("accepts a request the browser marks same-origin", () => {
    expect(isSameOrigin(headers({ ...host, "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it.each(["cross-site", "same-site", "none"])("rejects Sec-Fetch-Site: %s", (site) => {
    expect(isSameOrigin(headers({ ...host, "sec-fetch-site": site, origin: "https://findseek.example" }))).toBe(false);
  });

  it("falls back to the Origin header when the browser sends no fetch metadata", () => {
    expect(isSameOrigin(headers({ ...host, origin: "https://findseek.example" }))).toBe(true);
    expect(isSameOrigin(headers({ ...host, origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(headers({ ...host, origin: "https://findseek.example.evil.example" }))).toBe(false);
    expect(isSameOrigin(headers({ ...host, origin: "https://evil.example/findseek.example" }))).toBe(false);
    expect(isSameOrigin(headers({ ...host, origin: "http://findseek.example:8080" }))).toBe(false);
  });

  it("rejects an opaque or unreadable Origin", () => {
    expect(isSameOrigin(headers({ ...host, origin: "null" }))).toBe(false);
    expect(isSameOrigin(headers({ ...host, origin: "not a url" }))).toBe(false);
    expect(isSameOrigin(headers({ ...host, origin: "" }))).toBe(false);
  });

  it("rejects a request that says nothing about where it came from", () => {
    expect(isSameOrigin(headers({ ...host }))).toBe(false);
    expect(isSameOrigin(headers({}))).toBe(false);
  });

  it("uses the forwarded host when behind a proxy", () => {
    expect(isSameOrigin(headers({ host: "internal:3000", "x-forwarded-host": "findseek.example", origin: "https://findseek.example" }))).toBe(true);
    expect(isSameOrigin(headers({ host: "internal:3000", "x-forwarded-host": "findseek.example, other.example", origin: "https://findseek.example" }))).toBe(true);
    expect(isSameOrigin(headers({ host: "internal:3000", origin: "https://findseek.example" }))).toBe(false);
  });

  it("does not let a same-origin claim override a missing host", () => {
    expect(isSameOrigin(headers({ "sec-fetch-site": "same-origin" }))).toBe(true); // the browser vouches for it
  });
});
