import type { Metadata } from "next";
import { BrandMark } from "@/components/brand/brand-loader";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The sign-in screen.
 *
 * `next` is carried through from the proxy so somebody who followed a link to a
 * particular project lands back on it rather than on the front door. It is
 * validated in the form rather than trusted: an absolute URL in that parameter
 * is an open redirect, which is a real way to make a phishing link look like it
 * comes from us.
 */
export default async function LoginPage({ searchParams }: Props) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : null;

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <BrandMark height={56} />
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-2)] sm:p-8">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            For clients and for the team. The same account works in both.
          </p>

          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-text-subtle">
          Trouble signing in? Reply to the invitation email and somebody will
          sort it out.
        </p>
      </div>
    </main>
  );
}
