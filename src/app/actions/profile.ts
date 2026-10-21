"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MODEL } from "@/lib/ai/client";
import { readIntake } from "@/lib/ai/intake";
import { parseCv } from "@/lib/ai/parse-cv";
import { normaliseCity } from "@/lib/india/location";
import { fromMonth, logAiAction } from "@/lib/data/profile";
import { requireQuota } from "@/lib/data/quota";
import { MAX_INTAKE_CHARS } from "@/lib/limits";
import { safeRelativePath } from "@/lib/security";
import { getUser } from "@/lib/supabase/server";

const MAX_CV_BYTES = 4 * 1024 * 1024; // Vercel functions accept at most 4.5 MB per request

async function requireUser() {
  const { supabase, user } = await getUser();
  if (!supabase || !user) redirect("/login");
  return { supabase, user };
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const JOB_TYPES = ["full_time", "internship", "part_time", "contract", "apprenticeship"];
const STAGES = ["student", "fresher", "experienced"];
const MODES = ["remote", "hybrid", "onsite", "any"];

/** Pay is entered the way people say it: LPA for jobs, rupees per month for stipends. Stored as annual INR. */
function annualPay(amount: number | null, unit: string): number | null {
  if (amount == null || amount <= 0) return null;
  return unit === "month" ? Math.round(amount * 12) : Math.round(amount * 100000);
}

export async function savePreferences(formData: FormData) {
  const { supabase, user } = await requireUser();
  const consent = formData.get("consent_ai") === "on";
  const analytics = formData.get("consent_analytics") === "on";
  const next = safeRelativePath(String(formData.get("next") ?? ""), "/profile");

  const { data: current } = await supabase
    .from("profiles").select("consent_ai_processing_at, consent_outcome_analytics_at").eq("id", user.id).single();

  const stage = String(formData.get("career_stage") ?? "");
  const mode = String(formData.get("remote_preference") ?? "any");
  const jobTypes = formData.getAll("job_types").map(String).filter((t) => JOB_TYPES.includes(t));
  const cities = formData.getAll("preferred_cities").map(String).map((c) => normaliseCity(c) ?? c.trim()).filter(Boolean);
  const notice = num(formData.get("notice_period_days"));
  const years = num(formData.get("experience_years"));

  await supabase.from("profiles").update({
    full_name: String(formData.get("full_name") ?? "") || null,
    headline: String(formData.get("headline") ?? "") || null,
    location: String(formData.get("location") ?? "") || null,
    country_code: "in",
    target_roles: list(formData.get("target_roles")),
    domains: list(formData.get("domains")),
    interests: list(formData.get("interests")),
    career_stage: STAGES.includes(stage) ? stage : null,
    experience_years: years == null ? null : clamp(years, 0, 60),
    preferred_cities: [...new Set(cities)],
    open_to_relocate: formData.get("open_to_relocate") === "on",
    remote_preference: MODES.includes(mode) ? mode : "any",
    job_types: jobTypes.length ? jobTypes : ["full_time"],
    expected_pay_min_inr: annualPay(num(formData.get("expected_pay")), String(formData.get("expected_pay_unit") ?? "lpa")),
    notice_period_days: notice == null ? null : clamp(Math.round(notice), 0, 365),
    deal_breakers: list(formData.get("deal_breakers")),
    min_match_score: clamp(num(formData.get("min_match_score")) ?? 60, 0, 100),
    monthly_application_cap: clamp(num(formData.get("monthly_application_cap")) ?? 40, 1, 200),
    consent_ai_processing_at: consent ? (current?.consent_ai_processing_at ?? new Date().toISOString()) : null,
    consent_outcome_analytics_at: analytics ? (current?.consent_outcome_analytics_at ?? new Date().toISOString()) : null,
    onboarding_completed_at: new Date().toISOString(),
  }).eq("id", user.id);

  revalidatePath("/profile");
  revalidatePath("/jobs");
  redirect(`${next}${next.includes("?") ? "&" : "?"}saved=1`);
}

/**
 * Onboarding in the user's own words: "final-year CSE student in Bengaluru, want backend internships,
 * remote is fine, at least 20k stipend, no bonds". The AI turns it into preferences, which land in
 * the form for the user to check and save. Skills it hears are added unconfirmed, like CV facts.
 */
export async function readMyWords(formData: FormData) {
  const { supabase, user } = await requireUser();
  const text = String(formData.get("intake") ?? "").trim();
  if (text.length < 20) redirect("/onboarding?error=intake");
  if (text.length > MAX_INTAKE_CHARS) redirect("/onboarding?error=intake_long");
  if (formData.get("consent_ai") === "on") {
    await supabase.from("profiles").update({ consent_ai_processing_at: new Date().toISOString() })
      .eq("id", user.id).is("consent_ai_processing_at", null);
  }
  const { data: profile } = await supabase.from("profiles").select("consent_ai_processing_at").eq("id", user.id).single();
  if (!profile?.consent_ai_processing_at) redirect("/onboarding?error=consent");

  await requireQuota(supabase, "read_intake", "/onboarding");
  const intake = await readIntake(text);
  await supabase.from("profiles").update({
    intake_text: text,
    career_stage: intake.career_stage,
    experience_years: intake.experience_years,
    target_roles: intake.target_roles,
    domains: intake.domains,
    preferred_cities: intake.preferred_cities,
    open_to_relocate: intake.open_to_relocate ?? false,
    remote_preference: intake.remote_preference ?? "any",
    job_types: intake.job_types.length ? intake.job_types : ["full_time"],
    expected_pay_min_inr: intake.expected_pay_min_inr_annual,
    notice_period_days: intake.notice_period_days,
    deal_breakers: intake.deal_breakers,
    country_code: "in",
  }).eq("id", user.id);
  if (intake.skills.length) {
    await supabase.from("skills").upsert(
      intake.skills.map((name) => ({ user_id: user.id, name, confirmed: false })),
      { onConflict: "user_id,name", ignoreDuplicates: true },
    );
  }
  await logAiAction(supabase, {
    user_id: user.id, action: "read_intake", model: MODEL, input_ref: "onboarding",
    output_summary: `${intake.target_roles.length} roles, ${intake.preferred_cities.length} cities, ${intake.skills.length} skills (to confirm)`,
  });
  revalidatePath("/onboarding");
  redirect("/onboarding?step=prefs&from=ai");
}

export async function uploadCv(formData: FormData) {
  const { supabase, user } = await requireUser();
  const base = formData.get("next") === "/onboarding" ? "/onboarding?step=cv&" : "/profile?";
  const { data: profile } = await supabase.from("profiles").select("consent_ai_processing_at").eq("id", user.id).single();
  if (!profile?.consent_ai_processing_at) redirect(`${base}error=consent`);

  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) redirect(`${base}error=nofile`);
  if (file.size > MAX_CV_BYTES) redirect(`${base}error=toolarge`);
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isText = file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt");
  if (!isPdf && !isText) redirect(`${base}error=type`);

  await requireQuota(supabase, "parse_cv", base.replace(/[?&]$/, ""));
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error: storageError } = await supabase.storage.from("cvs").upload(path, bytes, { contentType: file.type || undefined });
  if (storageError) redirect(`${base}error=upload`);

  const parsed = await parseCv(isPdf ? { pdfBase64: bytes.toString("base64") } : { text: bytes.toString("utf8") });

  await supabase.from("cv_uploads").insert({ user_id: user.id, storage_path: path, original_filename: file.name, parsed_at: new Date().toISOString() });

  // Parsed facts land unconfirmed; the user reviews each before the AI may use it.
  if (parsed.experiences.length) {
    await supabase.from("experiences").insert(
      parsed.experiences.map((e) => ({
        user_id: user.id,
        kind: e.kind,
        organisation: e.organisation,
        title: e.title,
        location: e.location,
        start_date: fromMonth(e.start_date),
        end_date: fromMonth(e.end_date),
        bullets: e.bullets,
        confirmed: false,
      })),
    );
  }
  if (parsed.skills.length) {
    await supabase.from("skills").upsert(
      parsed.skills.map((s) => ({ user_id: user.id, name: s.name, years: s.years, confirmed: false })),
      { onConflict: "user_id,name", ignoreDuplicates: true },
    );
  }
  await supabase.from("profiles").update({
    full_name: parsed.full_name ?? undefined,
    headline: parsed.headline ?? undefined,
    location: parsed.location ?? undefined,
  }).eq("id", user.id).is("full_name", null);

  await logAiAction(supabase, {
    user_id: user.id, action: "parse_cv", model: MODEL, input_ref: path,
    output_summary: `${parsed.experiences.length} experiences, ${parsed.skills.length} skills extracted (unconfirmed)`,
  });
  revalidatePath("/profile");
  const back = String(formData.get("next") ?? "");
  redirect(back === "/onboarding" ? "/onboarding?step=cv&parsed=1" : "/profile?parsed=1");
}

export async function setExperienceConfirmed(id: string, confirmed: boolean) {
  const { supabase } = await requireUser();
  await supabase.from("experiences").update({ confirmed }).eq("id", id);
  revalidatePath("/profile");
}

export async function updateExperience(id: string, formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("experiences").update({
    organisation: String(formData.get("organisation") ?? ""),
    title: String(formData.get("title") ?? ""),
    start_date: fromMonth(String(formData.get("start_date") ?? "") || null),
    end_date: fromMonth(String(formData.get("end_date") ?? "") || null),
    bullets: String(formData.get("bullets") ?? "").split("\n").map((b) => b.trim()).filter(Boolean),
    confirmed: true,
  }).eq("id", id);
  revalidatePath("/profile");
}

export async function deleteExperience(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("experiences").delete().eq("id", id);
  revalidatePath("/profile");
}

export async function addSkill(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (name) await supabase.from("skills").upsert({ user_id: user.id, name, confirmed: true }, { onConflict: "user_id,name" });
  revalidatePath("/profile");
}

export async function setSkillConfirmed(id: string, confirmed: boolean) {
  const { supabase } = await requireUser();
  await supabase.from("skills").update({ confirmed }).eq("id", id);
  revalidatePath("/profile");
}

export async function deleteSkill(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("skills").delete().eq("id", id);
  revalidatePath("/profile");
}
