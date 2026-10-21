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
