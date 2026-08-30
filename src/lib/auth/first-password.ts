import { randomBytes } from "node:crypto";

/**
 * A first password.
 *
 * Random, not memorable. It is emailed, used once, and changed — a pattern a
 * person could guess from somebody else's is worth nothing, and one they can
 * remember is one they will keep.
 *
 * In its own file because two flows now issue one: approving a project, and
 * inviting a client's contact afterwards. Two generators would eventually be two
 * different lengths, and the shorter one would be the one nobody noticed.
 */
export function firstPassword(): string {
  return randomBytes(12).toString("base64url");
}
