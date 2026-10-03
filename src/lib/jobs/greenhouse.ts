import { z } from "zod";
import type { NormalizedJob } from "./types";
import { htmlToText, looksRemote } from "./text";

// Public Job Board API: GET needs no auth. Submitting applications needs the
// employer's own key, so FindSeek only reads listings here.
// https://developers.greenhouse.io/job-board.html
const GreenhouseResponse = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      absolute_url: z.string(),
      updated_at: z.string().nullish(),
      first_published: z.string().nullish(),
      content: z.string().nullish(),
      location: z.object({ name: z.string().nullish() }).nullish(),
      company_name: z.string().nullish(),
    }),
  ),
});

export async function fetchGreenhouseBoard(boardToken: string, companyName: string): Promise<NormalizedJob[]> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Greenhouse ${boardToken}: HTTP ${res.status}`);
  const data = GreenhouseResponse.parse(await res.json());

  return data.jobs.map((job) => {
    const location = job.location?.name ?? null;
    return {
      source: "greenhouse",
      external_id: `${boardToken}:${job.id}`,
      company: job.company_name ?? companyName,
      title: job.title,
      location,
      country_code: null,
      remote: looksRemote(location, job.title),
      description: htmlToText(job.content ?? ""),
      apply_url: job.absolute_url,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      posted_at: job.first_published ?? job.updated_at ?? null,
    };
  });
}
