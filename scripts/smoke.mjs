#!/usr/bin/env node
// Post-deploy smoke test. Needs no login, no secrets and no browser, only Node 18+.
//
//   node scripts/smoke.mjs https://findseek.vercel.app
//   npm run smoke -- https://findseek.vercel.app
//
// It checks what a stranger on the internet can reach: security headers, that private routes stay
// private, that a crafted link can't print text on the page or bounce a visitor to another site.
// It reads, never writes: every request is a GET (plus one POST that must be refused).
// Exit code is 0 when every check passes, 1 otherwise.

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function get(path, init = {}) {
  try {
    const res = await fetch(base + path, { redirect: "follow", cache: "no-store", ...init });
    const body = init.method === "POST" || init.redirect === "manual" ? "" : await res.text();
    const end = new URL(res.url);
    return { res, body, finalPath: end.pathname + end.search, sameOrigin: end.origin === new URL(base).origin };
  } catch (error) {
    // A request that can't complete counts as a failed check, not a crash.
    const res = { status: 0, headers: new Headers(), url: base + path };
    return { res, body: "", finalPath: path, sameOrigin: false, error: String(error?.cause?.code ?? error?.message ?? error) };
  }
}

/** Page text with scripts and styles removed: what a visitor could actually read. */
const visibleText = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");

console.log(`Smoke test against ${base}\n`);

// 1. The site answers, and is the right app.
const home = await get("/");
check("home page loads", home.res.status === 200, `status ${home.res.status}`);
check("home page is FindSeek", /FindSeek/.test(home.body) && /<h1[^>]*>[^<]*checked/i.test(home.body));
check("page language is en-IN", /<html[^>]*lang="en-IN"/.test(home.body));

// 2. Security headers.
const h = home.res.headers;
const csp = h.get("content-security-policy") ?? "";
check("CSP forbids framing (frame-ancestors 'none')", /frame-ancestors 'none'/.test(csp));
check("CSP blocks plugins and base-tag tricks", /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp));
check("CSP only submits forms to this site", /form-action 'self'/.test(csp));
check("no third-party script sources in CSP", !/script-src[^;]*https?:/.test(csp));
check("X-Frame-Options DENY", h.get("x-frame-options") === "DENY");
check("X-Content-Type-Options nosniff", h.get("x-content-type-options") === "nosniff");
check("Referrer-Policy set", (h.get("referrer-policy") ?? "") !== "");
check("Permissions-Policy denies camera, mic, location", /camera=\(\)/.test(h.get("permissions-policy") ?? "") && /microphone=\(\)/.test(h.get("permissions-policy") ?? "") && /geolocation=\(\)/.test(h.get("permissions-policy") ?? ""));
if (base.startsWith("https://")) {
  check("HSTS set (https only)", /max-age=\d{7,}/.test(h.get("strict-transport-security") ?? ""));
}
check("X-Powered-By hidden", !h.get("x-powered-by"));

// 3. Private endpoints refuse strangers.
const ingest = await get("/api/jobs/ingest");
check("job ingestion refuses a request with no secret", ingest.res.status === 401, `status ${ingest.res.status}`);
const ingestWrong = await get("/api/jobs/ingest", { headers: { authorization: "Bearer not-the-secret" } });
check("job ingestion refuses a wrong secret", ingestWrong.res.status === 401, `status ${ingestWrong.res.status}`);
const ingestPost = await get("/api/jobs/ingest", { method: "POST" });
check("job ingestion refuses POST", [401, 404, 405].includes(ingestPost.res.status), `status ${ingestPost.res.status}`);
const exportRes = await get("/api/account/export");
check("account export refuses a signed-out visitor", exportRes.res.status === 401, `status ${exportRes.res.status}`);
const del = await get("/api/account/delete");
check("account delete can't be triggered by a plain GET", [401, 404, 405].includes(del.res.status), `status ${del.res.status}`);

// 4. Signed-in areas: the sign-in page. (A dev server with no keys opens them with a setup notice instead.)
for (const path of ["/jobs", "/profile", "/tracker", "/admin"]) {
  const r = await get(path);
  const toLogin = r.finalPath.startsWith("/login");
  const setup = r.res.status === 200 && /Setup needed/.test(r.body);
  check(`${path} is private (sign-in or setup notice)`, toLogin || setup, toLogin ? "sent to sign-in" : setup ? "setup notice, nothing private shown" : `opened with status ${r.res.status} and no sign-in`);
}

// 5. The reports review page is invisible to everyone but the operators.
const ops = await get("/ops/reports");
check("/ops/reports hidden from strangers", ops.res.status === 404 || ops.finalPath.startsWith("/login"), `status ${ops.res.status}, ended at ${ops.finalPath.split("?")[0]}`);

// 6. A crafted link can't print text on the page or send a visitor elsewhere.
const payload = "<img src=x onerror=document.title='pwned'>";
const xss = await get("/login?error=" + encodeURIComponent(payload));
check("?error= text is never rendered as HTML", !visibleText(xss.body).includes("onerror=") && !/<img[^>]+src=["']?x["']?[^>]*onerror/i.test(xss.body.replace(/<script[\s\S]*?<\/script>/gi, "")));
const scam = await get("/login?error=" + encodeURIComponent("Pay Rs 2000 to restore your account"));
check("?error= can't show a made-up message (fixed list only)", !visibleText(scam.body).includes("Pay Rs 2000"));
const known = await get("/login?error=link");
check("a real error code still shows its fixed message", /invalid or has expired/.test(visibleText(known.body)));

for (const next of ["//evil.example.com", "https://evil.example.com", "/\\evil.example.com"]) {
  // Don't follow: read where the first answer points, so a real open redirect never makes us visit that site.
  const r = await get(`/auth/callback?code=x&next=${encodeURIComponent(next)}`, { redirect: "manual" });
  const location = r.res.headers.get("location");
  const target = location ? new URL(location, base) : null;
  const stays = !r.error && (!target || target.origin === new URL(base).origin);
  check(`sign-in callback won't send a visitor to ${next}`, stays, target ? `points to ${target.origin}${target.pathname}` : "no redirect");
}

// 7. Unknown paths and secrets files.
for (const path of ["/.env", "/.git/config", "/zz-not-a-page"]) {
  const r = await get(path);
  check(`${path} is not served`, r.res.status === 404, `status ${r.res.status}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) {
  console.log("\nFailed:\n" + failed.map((f) => ` - ${f.name}${f.detail ? ` (${f.detail})` : ""}`).join("\n"));
  process.exit(1);
}
