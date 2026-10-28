import type { Metadata } from "next";

/** Signed-in and account pages: nothing a search engine should list. */
export const PRIVATE_PAGE: Metadata = { robots: { index: false, follow: false } };

/**
 * Paths crawlers are asked to skip. The operator review area is deliberately not listed: it answers
 * "not found" to everyone else, and a line in robots.txt would announce that it exists. It is kept out of
 * search results with PRIVATE_PAGE instead.
 */
export const CRAWLER_SKIP = ["/api/", "/auth/", "/login", "/dashboard", "/jobs", "/tracker", "/profile", "/settings", "/onboarding", "/admin"];
