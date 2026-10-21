export type JobSource = "adzuna" | "greenhouse" | "lever" | "manual" | "user_submitted";

/** A job listing normalised across every source. Mirrors the `jobs` table. */
export interface NormalizedJob {
  source: JobSource;
  external_id: string;
  company: string;
  title: string;
  location: string | null;
  country_code: string | null;
  remote: boolean | null;
  description: string;
  apply_url: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: string | null;
}
