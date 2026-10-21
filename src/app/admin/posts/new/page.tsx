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
      <h1>New opening</h1>
      <Notice error={error} />
      <form action={createPost} className="card grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">Job title</label>
          <input id="title" name="title" required minLength={2} maxLength={160} className="input" placeholder="Senior data engineer" />
        </div>
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input id="location" name="location" className="input" placeholder="Bengaluru" />
        </div>
        <div>
          <label className="label" htmlFor="pay_min">Pay</label>
          <div className="flex gap-2">
            <input id="pay_min" name="pay_min" type="number" min={0} step="0.1" required className="input" placeholder="From" aria-label="Pay from" />
            <input name="pay_max" type="number" min={0} step="0.1" className="input" placeholder="To" aria-label="Pay to" />
            <select name="pay_unit" defaultValue="lpa" className="input w-auto" aria-label="Pay unit">
              <option value="lpa">LPA</option>
              <option value="month">₹ per month</option>
            </select>
          </div>
          <p className="mt-1 muted">Required. Openings without pay don&apos;t pass verification.</p>
        </div>
        <div>
          <label className="label" htmlFor="work_style">Work style</label>
          <select id="work_style" name="work_style" defaultValue="" className="input">
            <option value="">Not specified</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" required minLength={40} rows={10} className="input" placeholder="What the role involves, the team, and what you're looking for." />
          <p className="mt-1 muted">Candidates see this text. Include a qualifications section (degree, skills, years of experience); openings without one don&apos;t pass verification. Add your screening criteria on the next page.</p>
        </div>
        <div className="sm:col-span-2"><button className="btn">Save as draft</button></div>
      </form>
    </div>
  );
}
