import Link from "next/link";
import { signInWithEmail } from "@/app/actions/auth";
import { Notice } from "@/components/notice";
import { SetupNotice } from "@/components/setup-notice";
import { PRIVATE_PAGE } from "@/lib/seo";

export const metadata = { ...PRIVATE_PAGE, title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, sent, next } = await searchParams;
  return (
    <>
      <SetupNotice />
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-16">
        <Link href="/" className="display mb-10 text-[24px] font-semibold" style={{ fontStretch: "80%" }}>FindSeek</Link>
        <h1>Sign in or create an account</h1>
        <p className="mt-2 mb-6 text-[15px] text-muted">We&apos;ll email you a one-time link. No password to remember.</p>
        <div className="mb-4"><Notice error={error} /></div>
        {sent ? (
          <div className="panel p-5 text-[15px]">Check your inbox for the sign-in link. It works once.</div>
        ) : (
          <form action={signInWithEmail} className="space-y-4">
            <input type="hidden" name="next" value={typeof next === "string" ? next : "/dashboard"} />
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="input h-11" placeholder="you@example.com" />
            </div>
            <button className="btn h-11 w-full">Email me a sign-in link</button>
          </form>
        )}
      </main>
    </>
  );
}
