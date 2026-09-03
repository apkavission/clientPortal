/**
 * The bucket project files live in.
 *
 * **Private, and it stays private.** Nothing in this estate serves a client's
 * document from a public URL — a public bucket means one guessed or leaked path
 * is one client reading another's contract, with no sign-in involved and no
 * record that it happened.
 *
 * Every read therefore goes through the application: our own tables decide
 * whether this person may have this file, and only then is a short-lived signed
 * URL made for it.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const config = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const NAME = "project-files";

const { data: buckets } = await admin.storage.listBuckets();
const existing = buckets?.find((bucket) => bucket.name === NAME);

if (existing) {
  console.log(`bucket "${NAME}" already exists (public: ${existing.public})`);
} else {
  const { error } = await admin.storage.createBucket(NAME, {
    public: false,
    /* Twenty-five megabytes. Big enough for a contract, a set of screens or a
       logo pack; small enough that nobody uses this as a video host by accident
       and discovers the bill later. */
    fileSizeLimit: 25 * 1024 * 1024,
  });

  if (error) {
    console.log("could not create it:", error.message);
    process.exit(1);
  }

  console.log(`created the private bucket "${NAME}"`);
}
