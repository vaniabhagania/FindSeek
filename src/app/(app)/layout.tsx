import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { SetupNotice } from "@/components/setup-notice";
import { getUser } from "@/lib/supabase/server";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/profile", label: "Profile" },
  { href: "/jobs", label: "Jobs" },
  { href: "/tracker", label: "Tracker" },
  { href: "/settings", label: "Privacy" },
  { href: "/admin", label: "Hiring" },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user } = await getUser();
  if (supabase && !user) redirect("/login");

  return (
    <>
      <SetupNotice />
      <header className="no-print border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="font-semibold">FindSeek</Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-muted hover:text-foreground">{n.label}</Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto">
            <span className="mr-3 muted">{user?.email}</span>
            <button className="btn-ghost">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
