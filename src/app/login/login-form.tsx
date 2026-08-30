"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/redirect";

/**
 * Email and password, against Supabase auth.
 *
 * Signed in from the browser rather than through a server action, because the
 * session has to end up in the browser client's own storage as well as in the
 * cookie. `router.refresh()` afterwards is what makes the server re-run the
 * proxy with the new cookie; without it the redirect races the session and
 * lands back here.
 *
 * **The error message is deliberately vague.** Supabase distinguishes "no such
 * account" from "wrong password" and repeating that distinction would let
 * anybody test whether an address has an account here — which, for a portal
 * whose users are named clients, is worth something to somebody. One sentence
 * covers both.
 */
export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const { error: refused } = await createClient().auth.signInWithPassword({
      email,
      password,
    });

    if (refused) {
      setPending(false);
      setError("That email and password do not match an account.");
      return;
    }

    router.refresh();
    router.replace(safeNext(next));
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5">
      <Field label="Email" required>
        {(id, describedBy) => (
          <input
            id={id}
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            aria-describedby={describedBy}
            className={FIELD}
          />
        )}
      </Field>

      <Field label="Password" required>
        {(id, describedBy) => (
          <input
            id={id}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby={describedBy}
            className={FIELD}
          />
        )}
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <BrandSpinner />
            Signing in
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
