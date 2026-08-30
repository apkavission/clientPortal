/**
 * Where it is safe to send somebody after they sign in.
 *
 * The `next` parameter arrives in a URL, which means anybody can write it. An
 * absolute address there is an **open redirect**: a link that starts with this
 * application's own domain, passes a real login, and lands the person on
 * somebody else's page. That is the shape of a convincing phishing link, and
 * the reason it works is that the first half of it is genuine.
 *
 * So only a path within this application is accepted. Everything else falls
 * back to the front door, which sends people to their own half of the
 * application anyway — the safe answer is also the useful one.
 *
 * Pure and exported so it can be tested without a browser.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/";

  const value = next.trim();

  // Must be a path on this site: one leading slash, and not a protocol-relative
  // "//evil.example" which a browser treats as an absolute address.
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  // A backslash is normalised to a forward slash by some browsers, so "/\evil"
  // can become "//evil". Refused rather than rewritten.
  if (value.includes("\\")) return "/";

  // Sending somebody back to the login screen after they have just used it is a
  // loop, and it reads as the sign-in having failed.
  if (value === "/login" || value.startsWith("/login?")) return "/";

  return value;
}
