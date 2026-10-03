import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient, getUser } from "@/lib/supabase/server";

/** Right to erasure: removes stored CV files, then the auth user (rows cascade). */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!supabase || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  if (form.get("confirm") !== "DELETE") {
    return NextResponse.redirect(new URL("/settings?error=confirm", request.url), 303);
  }

  const admin = createServiceClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });

  const { data: files } = await admin.storage.from("cvs").list(user.id);
  if (files?.length) await admin.storage.from("cvs").remove(files.map((f) => `${user.id}/${f.name}`));
  await admin.auth.admin.deleteUser(user.id);
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/?deleted=1", request.url), 303);
}
