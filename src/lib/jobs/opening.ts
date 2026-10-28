/**
 * Whether candidates may still apply to an employer's opening posted on FindSeek.
 *
 * The post's own status is not enough. An operator who confirms a scam report pulls the listing
 * candidates see (closed or held in `jobs`), and the post can still say "open". The database applies
 * the same rule (`post_is_live`, migration 0007); this mirrors it so the page and the action agree
 * with it and give a clear message instead of a database error.
 */
export function openingAcceptsApplications(
  postStatus: string | null | undefined,
  listing: { verification_status?: string | null; closed_at?: string | null } | null | undefined,
): boolean {
  if (postStatus !== "open") return false;
  if (!listing) return false;
  return listing.verification_status === "verified" && !listing.closed_at;
}
