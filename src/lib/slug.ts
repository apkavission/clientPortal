/**
 * A name, as a web address.
 *
 * Lives here rather than in the action that uses it for a reason the build
 * enforced: a `"use server"` file may only export async functions, because
 * every export becomes a callable HTTP endpoint. A pure helper in there is a
 * build error, and the error is right — a slug function reachable over the
 * network would be a small, silly attack surface.
 *
 * The slug is part of a URL, so anything that would have to be escaped stops
 * being a character rather than being encoded. Two clients asking for a
 * "Website redesign" is ordinary, and the caller adds a suffix when the address
 * is taken; that is not this function's job.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
