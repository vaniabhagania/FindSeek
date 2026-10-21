import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updatePost } from "@/app/actions/admin";
import { PostFields } from "@/components/admin/post-fields";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";
import { payForForm } from "@/lib/admin/pay-input";
import { getRecruiter } from "@/lib/admin/session";

export default async function EditPostPage({ params, searchParams }: PageProps<"/admin/posts/[id]/edit">) {
  const { id } = await params;
  const { error, checks } = await searchParams;
  const { supabase, user, employer } = await getRecruiter();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;
  if (!employer) redirect("/admin");

  const { data: post } = await supabase
    .from("job_posts").select("*").eq("id", id).eq("employer_id", employer.id).maybeSingle();
  if (!post) notFound();

  const pay = payForForm(post);
  const live = post.status === "open";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href={`/admin/posts/${post.id}`} className="muted underline">← {post.title}</Link>
      <h1>Edit opening</h1>
      {live && (
        <p className="rounded-lg border border-line bg-raised px-4 py-3 text-[15px]">
          This opening is live. Candidates see your changes as soon as you save, and the opening still has to pass every
          verification check, so a change that breaks one won&apos;t be saved.
        </p>
      )}
      {!live && post.pay_min_inr == null && (
        <p className="rounded-lg border border-line bg-raised px-4 py-3 text-[15px]">
          This opening has no pay yet. Every opening on FindSeek states a salary or stipend, so add it before publishing.
        </p>
      )}
      <Notice error={error} checks={checks} />
      <form action={updatePost.bind(null, post.id)} className="card grid gap-4 sm:grid-cols-2">
        <PostFields
          defaults={{
            title: post.title,
            location: post.location ?? "",
            workStyle: post.remote === true ? "remote" : post.remote === false ? "onsite" : "",
            payFrom: pay.from,
            payTo: pay.to,
            payUnit: pay.unit,
            description: post.description,
          }}
        />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <SubmitButton working="Saving…">Save changes</SubmitButton>
          <Link href={`/admin/posts/${post.id}`} className="btn-quiet">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
