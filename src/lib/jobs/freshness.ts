// Stale and ghost listings are the biggest complaint about aggregators: you tailor a CV,
// click apply, and the job closed weeks ago. FindSeek tracks when each listing was last
// seen live at its source and shows plain reasons instead of an opaque "ghost score".

const DAY = 24 * 60 * 60 * 1000;

export type Freshness = "new" | "recent" | "aging" | "stale" | "closed";

export function freshness(
  job: { posted_at: string | null; last_seen_at?: string | null; closed_at?: string | null },
  now = new Date(),
): Freshness {
  if (job.closed_at) return "closed";
  const seen = job.last_seen_at ? now.getTime() - new Date(job.last_seen_at).getTime() : 0;
  if (seen > 3 * DAY) return "stale"; // not seen at the source in the last three daily checks
  const age = job.posted_at ? now.getTime() - new Date(job.posted_at).getTime() : Infinity;
  if (age <= 3 * DAY) return "new";
  if (age <= 14 * DAY) return "recent";
  if (age <= 45 * DAY) return "aging";
  return "stale";
}

/** "Checked 3 hours ago" — when the listing was last confirmed live at its source. */
export function checkedAgo(lastSeen: string | null | undefined, now = new Date()): string | null {
  if (!lastSeen) return null;
  const mins = Math.max(0, Math.round((now.getTime() - new Date(lastSeen).getTime()) / 60000));
  if (mins < 60) return `Checked live ${mins <= 1 ? "just now" : `${mins} min ago`}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `Checked live ${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `Last seen live ${Math.round(hours / 24)} days ago`;
}

export function postedAgo(postedAt: string | null | undefined, now = new Date()): string | null {
  if (!postedAt) return null;
  const days = Math.floor((now.getTime() - new Date(postedAt).getTime()) / DAY);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  return `Posted ${days} days ago`;
}

/** Signs that a listing may not be a real, open vacancy. Each one is a sentence a user can check. */
export function ghostSignals(
  job: { posted_at: string | null; description: string; repost_count?: number | null },
  now = new Date(),
): string[] {
  const signals: string[] = [];
  const age = job.posted_at ? (now.getTime() - new Date(job.posted_at).getTime()) / DAY : null;
  if (age !== null && age > 45) signals.push(`Open for ${Math.round(age)} days, longer than most real vacancies`);
  if ((job.repost_count ?? 0) >= 2) signals.push(`Reposted ${job.repost_count} times under new listings`);
  if (/\b(talent (pool|community)|future (openings|opportunities)|always (hiring|looking)|evergreen|general application)\b/i.test(job.description)) {
    signals.push("Collects CVs for future roles rather than one open vacancy");
  }
  return signals;
}
