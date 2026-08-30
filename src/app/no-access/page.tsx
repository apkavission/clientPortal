import type { Metadata } from "next";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getStaffSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "No access" };

/**
 * Signed in, and not one of us.
 *
 * A real state rather than an error. This panel is the company's own, so an
 * account that is not on the staff list reaches nothing — a client login, an
 * account whose staff row was never created, or somebody who has been made
 * inactive because they left.
 *
 * Said plainly, with a way out. The failure people meet most often on a screen
 * like this is being told "access denied" with no indication of what to do, so
 * this names what is missing and offers the sign-out that lets them try another
 * account.
 *
 * Deliberately does not redirect. Bouncing somebody to the sign-in screen they
 * have already used is the most confusing possible answer to "you are signed in
 * as the wrong person".
 */
export default async function NoAccessPage() {
  const session = await getStaffSession();

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-2)]">
        <h1 className="text-xl font-semibold">This account cannot open the panel</h1>

        <p className="measure mt-3 text-sm leading-relaxed text-text-muted">
          You are signed in, but this account is not on the staff list — or it has
          been made inactive.
        </p>

        <p className="measure mt-3 text-sm leading-relaxed text-text-muted">
          This panel is for the company only. If you are a client, your project is
          in the tracker rather than here, and the address for it was in your
          welcome email.
        </p>

        {session ? (
          <p className="measure mt-3 text-sm leading-relaxed text-text-muted">
            If you were expecting to get in, ask an owner to check your account on
            the Team screen.
          </p>
        ) : null}

        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
