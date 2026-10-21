// Response headers sent on every page. Kept free of imports so next.config.ts can load it directly.
//
// The content policy is not a nonce policy: Next.js needs inline scripts for hydration, and a nonce
// would make every page dynamic. What it does stop is the rest of the list: pages framed by another
// site, forms posted to another site, a planted <base> tag, plugins, and scripts, images or requests
// loaded from anywhere but this site.

export interface HeaderOptions {
  production: boolean;
  supabaseUrl?: string;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ supabaseUrl }: Pick<HeaderOptions, "supabaseUrl">): string {
  const supabase = originOf(supabaseUrl);
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${supabase ? ` ${supabase}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function securityHeaders(options: HeaderOptions): { key: string; value: string }[] {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (options.production) {
    // Development needs eval and websockets for hot reload, and http://localhost cannot be upgraded.
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    headers.push({ key: "Content-Security-Policy", value: contentSecurityPolicy(options) });
  }
  return headers;
}
