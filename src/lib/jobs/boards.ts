// Company job boards FindSeek reads. Board tokens are the slug in
// boards.greenhouse.io/<token> or jobs.lever.co/<site>. The defaults are companies with
// offices or remote hiring in India; only their India-eligible roles pass verification.
// Add more without a code change through the env vars below, as "token:Company Name"
// pairs separated by commas. A board that no longer resolves is skipped and reported.

const DEFAULT_GREENHOUSE: { token: string; company: string }[] = [
  { token: "stripe", company: "Stripe" },
  { token: "databricks", company: "Databricks" },
  { token: "cloudflare", company: "Cloudflare" },
  { token: "gitlab", company: "GitLab" },
  { token: "airbnb", company: "Airbnb" },
  { token: "dropbox", company: "Dropbox" },
];

const DEFAULT_LEVER: { site: string; company: string }[] = [
  { site: "palantir", company: "Palantir" },
];

function parsePairs(value: string | undefined): { slug: string; company: string }[] {
  return (value ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [slug, ...name] = pair.split(":");
      return { slug: slug.trim(), company: name.join(":").trim() || slug.trim() };
    })
    .filter((p) => /^[a-z0-9-]+$/i.test(p.slug));
}

export function greenhouseBoards() {
  const extra = parsePairs(process.env.GREENHOUSE_BOARDS).map((p) => ({ token: p.slug, company: p.company }));
  return [...DEFAULT_GREENHOUSE, ...extra.filter((e) => !DEFAULT_GREENHOUSE.some((d) => d.token === e.token))];
}

export function leverSites() {
  const extra = parsePairs(process.env.LEVER_SITES).map((p) => ({ site: p.slug, company: p.company }));
  return [...DEFAULT_LEVER, ...extra.filter((e) => !DEFAULT_LEVER.some((d) => d.site === e.site))];
}
