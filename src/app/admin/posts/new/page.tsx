import Link from "next/link";
import { redirect } from "next/navigation";
import { createPost } from "@/app/actions/admin";
import { PostFields } from "@/components/admin/post-fields";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";
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
        <PostFields />
        <div className="sm:col-span-2">
          <SubmitButton working="Saving…">Save as draft</SubmitButton>
          <p className="mt-2 muted">Add your screening criteria on the next page.</p>
        </div>
      </form>
    </div>
  );
}
