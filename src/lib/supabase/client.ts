"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { clientEnv } from "@/lib/env";
import { DB_SCHEMA } from "@/lib/supabase/constants";

/**
 * The browser client.
 *
 * Used for one thing only: signing in and out, where the browser has to be the
 * one holding the session. Every read of portal data happens on the server, so
 * that what a person may see is decided by row-level security against their own
 * token rather than by a query somebody wrote in a component.
 */
export function createClient() {
  return createBrowserClient<Database, typeof DB_SCHEMA>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { db: { schema: DB_SCHEMA } },
  );
}
