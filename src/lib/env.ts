// Central place to read configuration so pages can degrade gracefully
// (show a "setup needed" notice) instead of crashing when keys are missing.

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  adzunaAppId: process.env.ADZUNA_APP_ID ?? "",
  adzunaAppKey: process.env.ADZUNA_APP_KEY ?? "",
  jobCountries: (process.env.JOB_COUNTRIES ?? "us,gb,ca,au")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean),
  cronSecret: process.env.CRON_SECRET ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isAiConfigured = Boolean(env.anthropicApiKey);
export const isAdzunaConfigured = Boolean(env.adzunaAppId && env.adzunaAppKey);
export const isEmailConfigured = Boolean(env.resendApiKey && env.emailFrom);

export function missingSetup(): string[] {
  const missing: string[] = [];
  if (!isSupabaseConfigured) missing.push("Supabase (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  if (!env.supabaseServiceRoleKey) missing.push("Supabase service role key (SUPABASE_SERVICE_ROLE_KEY)");
  if (!isAiConfigured) missing.push("Anthropic API key (ANTHROPIC_API_KEY)");
  if (!isAdzunaConfigured) missing.push("Adzuna (ADZUNA_APP_ID, ADZUNA_APP_KEY) - optional, Greenhouse/Lever work without it");
  if (!isEmailConfigured) missing.push("Email (RESEND_API_KEY, EMAIL_FROM) - optional, needed to send hiring outcome emails");
  return missing;
}
