import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isSupabaseConfigured } from "@/lib/env";

const PROTECTED_PREFIXES = ["/dashboard", "/profile", "/jobs", "/tracker", "/settings", "/admin", "/ops"];

function toSignIn(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

/** Refreshes the auth session cookie and guards app routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured) {
    // While building, the app shells open without keys so the screens can be worked on. A deployed site
    // with no database behind it must not show them: send visitors to sign-in like anyone signed out.
    const protectedPath = PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));
    return process.env.NODE_ENV === "production" && protectedPath ? toSignIn(request) : response;
  }

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!data.user && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) return toSignIn(request);
  return response;
}
