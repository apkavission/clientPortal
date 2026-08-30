import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { clientEnv } from "@/lib/env";
import { DB_SCHEMA } from "@/lib/supabase/constants";

/**
 * The client for a signed-in request.
 *
 * Reads and writes the session cookie, so every query it makes runs **as that
 * person** and row-level security decides what comes back. This is the client
 * almost everything should use: it is the layer that cannot be forgotten,
 * because the database applies it whether or not the code remembered to.
 *
 * Cookie writes are wrapped because a Server Component is not allowed to set
 * one. That is not an error to fix here — the refresh happens in `proxy.ts`,
 * which runs before rendering and can write. Swallowing it keeps a read-only
 * render from crashing on a token that was refreshed a moment ago anyway.
 */
export async function createClient() {
  const store = await cookies();

  return createServerClient<Database, typeof DB_SCHEMA>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      db: { schema: DB_SCHEMA },
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              store.set(name, value, options);
            }
          } catch {
            // A Server Component render. See the note above.
          }
        },
      },
    },
  );
}
