import { createHash, timingSafeEqual } from "node:crypto";

/**
 * A redirect target that stays on this site. Accepts "/dashboard?x=1" and rejects everything a browser
 * could read as another site: "//evil.com", "/\evil.com" (browsers treat the backslash as a slash),
 * "/<tab>/evil.com" (browsers delete tabs and newlines inside a URL), and full URLs.
 */
export function safeRelativePath(input: string | null | undefined, fallback: string): string {
  if (!input || input.length > 500) return fallback;
  if (!input.startsWith("/") || input.startsWith("//") || input.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(input)) return fallback;
  try {
    const base = "https://findseek.invalid";
    if (new URL(input, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return input;
}

/**
 * Does the Authorization header carry `Bearer <secret>`? Both sides are hashed first, so the comparison
 * takes the same time whatever the guess is and whatever its length.
 */
export function bearerMatches(header: string | null | undefined, secret: string): boolean {
  if (!secret || !header) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const actual = createHash("sha256").update(header).digest();
  return timingSafeEqual(expected, actual);
}

/**
 * Did this request come from a page on our own site? For routes that change something when a signed-in
 * user's cookies arrive with it, so another site cannot make the browser send the request for them.
 * Modern browsers say so themselves (Sec-Fetch-Site); older ones send an Origin header to compare with
 * the host. A request that says neither is refused.
 */
export function isSameOrigin(headers: { get(name: string): string | null }): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";

  const origin = headers.get("origin");
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return url.host === host && (url.protocol === "https:" || url.hostname === "localhost");
  } catch {
    return false;
  }
}
