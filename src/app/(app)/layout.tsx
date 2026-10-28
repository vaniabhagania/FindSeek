import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { AppNav } from "@/components/app-nav";
import { SetupNotice } from "@/components/setup-notice";
import { PRIVATE_PAGE } from "@/lib/seo";
import { getUser } from "@/lib/supabase/server";

export const metadata = PRIVATE_PAGE;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user } = await getUser();
  if (supabase && !user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <SetupNotice />
      <div className="flex flex-1">
        <AppNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:bg-transparent md:px-8 md:border-transparent">
            <Link href="/dashboard" className="display text-xl font-semibold md:hidden" style={{ fontStretch: "80%" }}>FindSeek</Link>
            <form action={signOut} className="ml-auto flex items-center gap-3">
              {user?.email && <span className="hidden text-sm text-muted sm:inline">{user.email}</span>}
              <button className="btn-quiet">Sign out</button>
            </form>
          </header>
          <main id="main" tabIndex={-1} className="w-full max-w-4xl flex-1 px-4 pt-4 pb-28 md:px-8 md:pb-16">{children}</main>
        </div>
      </div>
    </div>
  );
}
