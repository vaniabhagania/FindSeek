import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";

/** Data portability: everything FindSeek holds about the signed-in user, as JSON. */
export async function GET() {
  const { supabase, user } = await getUser();
  if (!supabase || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tables = ["profiles", "experiences", "skills", "cv_uploads", "job_matches", "applications", "tailored_documents", "ai_audit_log"];
  const entries = await Promise.all(
    tables.map(async (t) => {
      const query = supabase.from(t).select("*");
      const { data } = t === "profiles" ? await query.eq("id", user.id) : await query.eq("user_id", user.id);
      return [t, data ?? []] as const;
    }),
  );
  return new NextResponse(JSON.stringify({ exported_at: new Date().toISOString(), email: user.email, ...Object.fromEntries(entries) }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="findseek-data-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
