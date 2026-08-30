import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { clientEnv } from "@/lib/env";
import { AUTH_COOKIE_PREFIX, DB_SCHEMA } from "@/lib/supabase/constants";

/**
 * Session refresh, and the gate in front of everything.
 *
 * Called `proxy` rather than `middleware`: Next 16 renamed the convention, and
 * the behaviour is unchanged. Verified against
 * `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` rather
 * than assumed.
 *
 * Two jobs.
 *
 * **Refreshing the session.** Access tokens are short-lived and a Server
 * Component cannot set a cookie, so without a pass here the refreshed token has
 * nowhere to be written and a client is signed out in the middle of reading
 * their own project. `getUser()` performs the refresh; the cookies it leaves
 * behind matter more than what it returns.
 *
 * **Turning signed-out requests away.** This is routing, not authorisation: it
 * cannot see whether the person is staff or a client, and it does not try. That
 * is `lib/auth/session.ts`, and underneath both of them row-level security
 * decides which rows exist. Three layers, and this is the weakest by design.
 */

/** Whether the request carries a Supabase session at all. */
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith(AUTH_COOKIE_PREFIX));
}

/**
 * How long the auth server gets before this request gives up.
 *
 * Carried over from a defect found in the company website on 2026-08-29: that
 * project awaited `getUser()` with **no limit at all**, so if the auth server
 * stopped answering, every page a signed-in person opened waited for it
 * forever. Nothing rendered, no loader appeared, the tab simply span. A
 * Supabase project on the free tier pauses after seven days idle, which is
 * exactly that failure.
 *
 * It is written in here from the first day rather than added after somebody
 * reports a hang.
 */
const AUTH_TIMEOUT_MS = 4_000;

/** The user, or `"timeout"` — never a promise that does not settle. */
async function userWithin(
  supabase: ReturnType<typeof createServerClient<Database, typeof DB_SCHEMA>>,
  ms: number,
): Promise<{ user: { id: string } | null } | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });

  try {
    const settled = await Promise.race([supabase.auth.getUser(), expiry]);
    if (settled === "timeout") return "timeout";
    return { user: settled.data.user };
  } catch {
    // A refused connection is not a valid session.
    return "timeout";
  } finally {
    clearTimeout(timer);
  }
}

/** Pages a signed-out person is allowed to reach. */
const PUBLIC_PATHS = new Set(["/login", "/invite", "/auth/callback"]);

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.has(path) || path.startsWith("/invite/");
}

export async function proxy(request: NextRequest) {
  const { pathname: path } = request.nextUrl;

  if (!hasAuthCookie(request)) {
    if (isPublic(path)) return NextResponse.next({ request });

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Carries the request headers forward so Next's routing metadata survives,
  // and gives the Supabase client something to write cookies onto.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database, typeof DB_SCHEMA>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      db: { schema: DB_SCHEMA },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const outcome = await userWithin(supabase, AUTH_TIMEOUT_MS);

  /*
    What a failure to verify means.

    The one thing that must not happen is treating "could not verify" as "not
    signed in" and redirecting to the login screen — that screen needs the same
    auth server, so the person is bounced into a loop that cannot end with
    nothing on screen explaining it. It says so instead, with a status that
    means the service is unavailable rather than the credentials are wrong.
  */
  if (outcome === "timeout") {
    if (isPublic(path)) return response;

    return new NextResponse(
      "The sign-in service is not responding, so this page cannot confirm who you are. Nothing has been changed. Try again in a moment.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const { user } = outcome;

  // A cookie was present but did not verify — expired, revoked or forged.
  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Somebody already signed in has no use for the login screen.
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  /*
    Everything except Next's own assets and files with an extension.

    Written as one negative matcher rather than a list of protected prefixes,
    because a list has to be remembered: the day somebody adds a route and
    forgets to add it here is the day that route has no gate on it.
  */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)"],
};
