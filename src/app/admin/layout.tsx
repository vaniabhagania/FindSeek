import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { SetupNotice } from "@/components/setup-notice";
import { getRecruiter } from "@/lib/admin/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { supabase, user, employer } = await getRecruiter();
  if (supabase && !user) redirect("/login?next=/admin");

  return (
    <>
      <SetupNotice />
      <header className="no-print border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-semibold">FindSeek <span className="muted">for employers</span></Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href="/admin" className="text-muted hover:text-foreground">Openings</Link>
            {employer && <Link href="/admin/posts/new" className="text-muted hover:text-foreground">New opening</Link>}
            <Link href="/dashboard" className="text-muted hover:text-foreground">Job seeker view</Link>
          </nav>
          <form action={signOut} className="ml-auto">
            {employer && <span className="mr-3 muted">{employer.name}</span>}
            <button className="btn-ghost">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
