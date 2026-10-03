import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import type { TailoredCv } from "@/lib/ai/schemas";
import { getUser } from "@/lib/supabase/server";

/** Print-ready CV. "Save as PDF" in the browser's print dialog produces the file. */
export default async function CvPrintPage({ params }: PageProps<"/jobs/[id]/cv">) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!supabase || !user) notFound();

  const [{ data: profile }, { data: application }] = await Promise.all([
    supabase.from("profiles").select("full_name, location").eq("id", user.id).single(),
    supabase.from("applications").select("id").eq("user_id", user.id).eq("job_id", id).single(),
  ]);
  if (!application) notFound();
  const { data: doc } = await supabase.from("tailored_documents").select("cv")
    .eq("application_id", application.id).not("approved_at", "is", null)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (!doc) notFound();
  const cv = doc.cv as TailoredCv;

  return (
    <article className="mx-auto max-w-[800px] bg-white p-10 text-black">
      <div className="no-print mb-6"><PrintButton /></div>
      <h1 className="text-3xl font-semibold">{profile?.full_name}</h1>
      <p className="text-gray-600">{cv.headline}{profile?.location ? ` · ${profile.location}` : ""} · {user.email}</p>
      <p className="mt-4 text-sm">{cv.summary}</p>
      <h2 className="mt-6 border-b pb-1 text-sm font-semibold uppercase tracking-wide">Experience</h2>
      {cv.experiences.map((e) => (
        <section key={e.source_id + e.title} className="mt-3 break-inside-avoid">
          <div className="flex justify-between text-sm font-semibold">
            <span>{e.title}, {e.organisation}</span>
            <span className="font-normal text-gray-600">{e.start_date ?? ""} – {e.end_date ?? "Present"}</span>
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{e.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
        </section>
      ))}
      <h2 className="mt-6 border-b pb-1 text-sm font-semibold uppercase tracking-wide">Skills</h2>
      <p className="mt-2 text-sm">{cv.skills.join(" · ")}</p>
    </article>
  );
}
