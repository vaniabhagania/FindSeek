import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";

/** Data portability: everything FindSeek holds about the signed-in user, as JSON. */
export async function GET() {
  const { supabase, user } = await getUser();
  if (!supabase || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tables = ["profiles", "experiences", "skills", "cv_uploads", "job_matches", "applications", "tailored_documents", "ai_audit_log", "job_reports", "ai_usage"];
  const entries = await Promise.all(
    tables.map(async (t) => {
      const query = supabase.from(t).select("*");
      const { data } = t === "profiles" ? await query.eq("id", user.id) : await query.eq("user_id", user.id);
      return [t, data ?? []] as const;
    }),
  );

  // Jobs this person brought in from LinkedIn, Instagram, WhatsApp and the rest: the post they pasted
  // and what FindSeek made of it.
  const { data: broughtIn } = await supabase.from("jobs").select("*").eq("submitted_by", user.id);

  // Applications made to employers through FindSeek, with the AI brief and the outcome. This is the
  // candidate's right of access to automated assessment of them. Internal recruiter notes are excluded.
  const { data: submissions } = await supabase.from("post_applications").select("*").eq("user_id", user.id);
  const submissionIds = (submissions ?? []).map((s) => s.id);
  const [{ data: screenings }, { data: decisions }] = submissionIds.length
    ? await Promise.all([
        supabase.from("candidate_screenings").select("post_application_id, score, recommendation, criteria_results, reasons, summary, model, created_at").in("post_application_id", submissionIds),
        supabase.from("hiring_decisions").select("post_application_id, decision, ai_recommendation, decided_at").in("post_application_id", submissionIds),
      ])
    : [{ data: [] }, { data: [] }];

  return new NextResponse(
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        email: user.email,
        ...Object.fromEntries(entries),
        jobs_you_brought_in: broughtIn ?? [],
        employer_applications: submissions ?? [],
        employer_ai_assessments: screenings ?? [],
        employer_decisions: decisions ?? [],
      },
      null,
      2,
    ),
    {
      headers: {
        "Content-Type": "application/json",
        // Personal data: never let a browser or proxy keep a copy.
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="findseek-data-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    },
  );
}
