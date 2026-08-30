/**
 * Environment, read once and checked.
 *
 * Two exports, and the split is the point. `clientEnv` holds only values that
 * are safe in a browser bundle and are already public by design; `serverEnv`
 * reads secrets and throws if it is ever imported into client code.
 *
 * Checked at the edge of the process rather than at the point of use, so a
 * missing key is a clear sentence at boot instead of `undefined` reaching
 * Supabase and coming back as an authentication error nobody can trace.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in — see docs/README.md.`,
    );
  }
  return value;
}

/**
 * Values the browser is allowed to see.
 *
 * The anon key belongs here. It is not a secret: it identifies the project and
 * carries no privileges of its own — every row it can reach is a row a policy
 * allows an anonymous request to reach. The key that must never appear here is
 * the service role key, which bypasses row-level security entirely.
 */
export const clientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100",
} as const;

/**
 * Values that must never reach a browser.
 *
 * A function rather than a constant so that importing this module from a client
 * component does not immediately throw at build time for everyone — it throws
 * when somebody actually calls it, with a message naming the mistake.
 */
export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() was called in the browser. It reads secrets.");
  }

  return {
    SUPABASE_SERVICE_ROLE_KEY: required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  } as const;
}
