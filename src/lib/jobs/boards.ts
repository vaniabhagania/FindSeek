// Companies whose public job boards FindSeek reads. Board tokens are the slug in
// boards.greenhouse.io/<token> or jobs.lever.co/<site>. Extend freely: the
// ingestion job skips (and reports) any board that no longer resolves.
export const GREENHOUSE_BOARDS: { token: string; company: string }[] = [
  { token: "stripe", company: "Stripe" },
  { token: "airbnb", company: "Airbnb" },
  { token: "figma", company: "Figma" },
  { token: "discord", company: "Discord" },
  { token: "dropbox", company: "Dropbox" },
  { token: "cloudflare", company: "Cloudflare" },
  { token: "gitlab", company: "GitLab" },
  { token: "databricks", company: "Databricks" },
];

export const LEVER_SITES: { site: string; company: string }[] = [
  { site: "palantir", company: "Palantir" },
  { site: "plaid", company: "Plaid" },
];
