import Link from "next/link";
import { notFound } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { getOperator } from "@/lib/ops/session";

// Only people on the operator list ever see this section. Everyone else gets the same "not found"
// page as a mistyped address, so it does not even confirm the section exists.
export default async function OpsLayout({ children }: LayoutProps<"/ops">) {
  const operator = await getOperator();
  if (!operator) notFound();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center gap-4 border-b border-line bg-surface px-4 md:px-8">
        <Link href="/ops/reports" className="display text-xl font-semibold" style={{ fontStretch: "80%" }}>
          FindSeek <span className="text-muted">review</span>
        </Link>
        <Link href="/dashboard" className="btn-quiet">Back to the app</Link>
        <form action={signOut} className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{operator.user.email}</span>
          <button className="btn-quiet">Sign out</button>
        </form>
      </header>
      <main className="w-full max-w-4xl flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
