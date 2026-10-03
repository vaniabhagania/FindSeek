"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MODEL } from "@/lib/ai/client";
import { parseCv } from "@/lib/ai/parse-cv";
import { fromMonth, logAiAction } from "@/lib/data/profile";
import { getUser } from "@/lib/supabase/server";

const MAX_CV_BYTES = 4 * 1024 * 1024; // Vercel functions accept at most 4.5 MB per request

async function requireUser() {
  const { supabase, user } = await getUser();
  if (!supabase || !user) redirect("/login");
  return { supabase, user };
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export async function savePreferences(formData: FormData) {
  const { supabase, user } = await requireUser();
  const consent = formData.get("consent_ai") === "on";
  const analytics = formData.get("consent_analytics") === "on";

  const { data: current } = await supabase
    .from("profiles").select("consent_ai_processing_at, consent_outcome_analytics_at").eq("id", user.id).single();

  await supabase.from("profiles").update({
    full_name: String(formData.get("full_name") ?? "") || null,
    headline: String(formData.get("headline") ?? "") || null,
    location: String(formData.get("location") ?? "") || null,
    country_code: String(formData.get("country_code") ?? "") || null,
    target_roles: list(formData.get("target_roles")),
    domains: list(formData.get("domains")),
    interests: list(formData.get("interests")),
    remote_preference: String(formData.get("remote_preference") ?? "any"),
    min_match_score: Math.min(100, Math.max(0, Number(formData.get("min_match_score") ?? 60))),
    monthly_application_cap: Math.min(200, Math.max(1, Number(formData.get("monthly_application_cap") ?? 40))),
    consent_ai_processing_at: consent ? (current?.consent_ai_processing_at ?? new Date().toISOString()) : null,
    consent_outcome_analytics_at: analytics ? (current?.consent_outcome_analytics_at ?? new Date().toISOString()) : null,
    onboarding_completed_at: new Date().toISOString(),
  }).eq("id", user.id);

  revalidatePath("/profile");
}

export async function uploadCv(formData: FormData) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("consent_ai_processing_at").eq("id", user.id).single();
  if (!profile?.consent_ai_processing_at) redirect("/profile?error=consent");

  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) redirect("/profile?error=nofile");
  if (file.size > MAX_CV_BYTES) redirect("/profile?error=toolarge");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isText = file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt");
  if (!isPdf && !isText) redirect("/profile?error=type");

  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error: storageError } = await supabase.storage.from("cvs").upload(path, bytes, { contentType: file.type || undefined });
  if (storageError) redirect(`/profile?error=${encodeURIComponent(storageError.message)}`);

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
  redirect("/profile?parsed=1");
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
