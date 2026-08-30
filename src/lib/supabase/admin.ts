import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { clientEnv, getServerEnv } from "@/lib/env";
import { DB_SCHEMA } from "@/lib/supabase/constants";

/**
 * The client that bypasses row-level security.
 *
 * Exists for exactly two jobs that cannot be done as the signed-in person:
 * creating a client's login when they are invited, and reading an invite before
 * anybody is signed in to read it with.
 *
 * **Every call site must decide who is allowed to reach it before calling.**
 * This client has no opinion about that — it is the one place in the
 * application where the database will not save us, so the check has to be in
 * the code above it, and the reason has to be written down at the call site.
 */
export function createAdminClient() {
  return createSupabaseClient<Database, typeof DB_SCHEMA>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    getServerEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      db: { schema: DB_SCHEMA },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
