import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/redirect";

/**
 * Where a person lands after signing in.
 *
 * The failure this guards against is not a broken link. It is an **open
 * redirect**: a URL that begins with this application's domain, passes a real
 * sign-in, and delivers the person somewhere else entirely. The first half
 * being genuine is exactly what makes it work on someone.
 */

describe("safeNext", () => {
  it("keeps a path inside the application", () => {
    expect(safeNext("/portal/p/acme-website")).toBe("/portal/p/acme-website");
    expect(safeNext("/work?status=todo")).toBe("/work?status=todo");
  });

  it("refuses an absolute address", () => {
    expect(safeNext("https://evil.example/steal")).toBe("/");
    expect(safeNext("http://evil.example")).toBe("/");
  });

  it("refuses a protocol-relative address", () => {
    // A browser reads "//evil.example" as an absolute URL. It looks like a path.
    expect(safeNext("//evil.example/steal")).toBe("/");
  });

  it("refuses a backslash, which some browsers normalise into a slash", () => {
    /*
      Written with String.raw so the backslash survives being typed.
      The first version of this test used a quoted string and the escape
      collapsed: it asserted on "/evil.example", which has no backslash in
      it at all, and passed for the wrong reason until the assertion was
      read properly.
    */
    expect(safeNext(String.raw`/\evil.example`)).toBe("/");
    expect(safeNext(String.raw`\\evil.example`)).toBe("/");
  });

  it("refuses a javascript: or data: target", () => {
    expect(safeNext("javascript:alert(1)")).toBe("/");
    expect(safeNext("data:text/html,<script>")).toBe("/");
  });

  it("does not send somebody back to the login screen", () => {
    // A loop that reads as the sign-in having failed.
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/login?next=/work")).toBe("/");
  });

  it("falls back to the front door for nothing at all", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("   ")).toBe("/");
  });
});
