import { z } from "zod";
import type { NormalizedJob } from "./types";
import { looksRemote } from "./text";

// Public Postings API: GET needs no auth. The apply POST needs a key that only
// the employer's Super Admin can create, so FindSeek only reads listings here.
// https://github.com/lever/postings-api
const LeverPosting = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  applyUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
  descriptionPlain: z.string().nullish(),
  additionalPlain: z.string().nullish(),
  lists: z.array(z.object({ text: z.string(), content: z.string() })).nullish(),
  workplaceType: z.string().nullish(),
  country: z.string().nullish(),
  categories: z
    .object({ location: z.string().nullish(), commitment: z.string().nullish(), team: z.string().nullish() })
    .nullish(),
  salaryRange: z
    .object({ min: z.number().nullish(), max: z.number().nullish(), currency: z.string().nullish() })
    .nullish(),
});

export async function fetchLeverSite(site: string, companyName: string): Promise<NormalizedJob[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Lever ${site}: HTTP ${res.status}`);
  const postings = z.array(LeverPosting).parse(await res.json());

  return postings.map((p) => {
    const location = p.categories?.location ?? null;
    const lists = (p.lists ?? []).map((l) => `${l.text}\n${l.content.replace(/<[^>]+>/g, "")}`).join("\n\n");
    return {
      source: "lever",
      external_id: `${site}:${p.id}`,
      company: companyName,
      title: p.text,
      location,
      country_code: p.country?.toLowerCase() ?? null,
      remote: p.workplaceType === "remote" ? true : looksRemote(location),
      description: [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n\n").trim(),
      apply_url: p.applyUrl ?? p.hostedUrl,
      salary_min: p.salaryRange?.min ?? null,
      salary_max: p.salaryRange?.max ?? null,
      salary_currency: p.salaryRange?.currency ?? null,
      posted_at: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    };
  });
}
