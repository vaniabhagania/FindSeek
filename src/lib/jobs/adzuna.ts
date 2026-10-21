import { z } from "zod";
import { env } from "@/lib/env";
import type { NormalizedJob } from "./types";
import { looksRemote } from "./text";

// Adzuna Search API. Terms: every displayed listing must carry the
// "Jobs by Adzuna" attribution (see <AdzunaAttribution />), free tier is
// 2,500 calls/month, and commercial use needs a licence after a 14-day trial.
// https://developer.adzuna.com/docs/terms_of_service
export const ADZUNA_COUNTRIES = [
  "gb", "us", "de", "fr", "nl", "ca", "au", "in", "br", "pl", "za", "sg", "mx", "it", "at",
] as const;

const AdzunaResponse = z.object({
  results: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      title: z.string(),
      description: z.string(),
      redirect_url: z.string(),
      created: z.string().nullish(),
      salary_min: z.number().nullish(),
      salary_max: z.number().nullish(),
      company: z.object({ display_name: z.string().nullish() }).nullish(),
      location: z.object({ display_name: z.string().nullish() }).nullish(),
    }),
  ),
});

const CURRENCY: Record<string, string> = {
  gb: "GBP", us: "USD", ca: "CAD", au: "AUD", in: "INR", de: "EUR", fr: "EUR", nl: "EUR",
  it: "EUR", at: "EUR", pl: "PLN", br: "BRL", za: "ZAR", sg: "SGD", mx: "MXN",
};

export async function searchAdzuna(country: string, what: string, page = 1): Promise<NormalizedJob[]> {
  if (!env.adzunaAppId || !env.adzunaAppKey) return [];
  const params = new URLSearchParams({
    app_id: env.adzunaAppId,
    app_key: env.adzunaAppKey,
    what,
    results_per_page: "50",
    max_days_old: "21",
  });
  const res = await fetch(
    `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Adzuna ${country}: HTTP ${res.status}`);
  const data = AdzunaResponse.parse(await res.json());

  return data.results.map((r) => {
    const location = r.location?.display_name ?? null;
    return {
      source: "adzuna",
      external_id: String(r.id),
      company: r.company?.display_name ?? "Unknown company",
      title: r.title,
      location,
      country_code: country,
      remote: looksRemote(location, r.title, r.description),
      // Adzuna only returns a snippet; the full ad lives behind redirect_url.
      description: r.description,
      apply_url: r.redirect_url,
      salary_min: r.salary_min ?? null,
      salary_max: r.salary_max ?? null,
      salary_currency: CURRENCY[country] ?? null,
      posted_at: r.created ?? null,
    };
  });
}
