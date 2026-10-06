import Link from "next/link";
import { redirect } from "next/navigation";
import { createPost } from "@/app/actions/admin";
import { Notice } from "@/components/notice";
import { getRecruiter } from "@/lib/admin/session";

export default async function NewPostPage({ searchParams }: PageProps<"/admin/posts/new">) {
  const { error } = await searchParams;
  const { supabase, user, employer } = await getRecruiter();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;
  if (!employer) redirect("/admin");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/admin" className="muted underline">← Openings</Link>
      <h1 className="text-2xl font-semibold">New opening</h1>
      <Notice error={error} />
      <form action={createPost} className="card grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">Job title</label>
          <input id="title" name="title" required minLength={2} maxLength={160} className="input" placeholder="Senior data engineer" />
        </div>
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input id="location" name="location" className="input" placeholder="Berlin" />
        </div>
        <div>
          <label className="label" htmlFor="country_code">Country code</label>
          <input id="country_code" name="country_code" maxLength={2} className="input" placeholder="de" />
        </div>
        <div>
          <label className="label" htmlFor="work_style">Work style</label>
          <select id="work_style" name="work_style" defaultValue="" className="input">
            <option value="">Not specified</option>
            <option value="remote">Remote</option>
            <option value="onsite">On-site</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" required minLength={40} rows={10} className="input" placeholder="What the role involves, the team, and what you're looking for." />
          <p className="mt-1 muted">Candidates see this text. Add your screening criteria on the next page.</p>
        </div>
        <div className="sm:col-span-2"><button className="btn">Save as draft</button></div>
      </form>
    </div>
  );
}
