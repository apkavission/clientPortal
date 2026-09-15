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

  /*
    The same field the signed-in screens sit on.

    This is the first thing a client ever sees of the company, and a white box
    centred on flat grey is what every sign-in page on the internet looks like.

    The comment is here and not in the JSX below, where a curly-brace comment
    in the slot before an element's opening tag is an expression where a return
    value is expected — a parse error rather than a comment. Writing that out
    inside a block comment is its own trap: the closing marker of the inner
    comment ends the outer one, and everything after it is parsed as code.
  */
  return (
    <main className="chrome-field container-page flex min-h-dvh flex-col items-center justify-center py-16">
      <div className="w-full max-w-md panel p-8 shadow-[var(--shadow-2)]">
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
