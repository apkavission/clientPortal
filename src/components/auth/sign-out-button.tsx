"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign out, from the browser.
 *
 * Done client-side because the session lives in a cookie the browser client
 * owns: calling `signOut()` here clears it and the local storage copy together.
 * `router.refresh()` afterwards is what makes the server re-run the proxy and
 * send the now-anonymous request to the login screen — without it the person
 * stays looking at a page they can no longer load.
 */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="secondary"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await createClient().auth.signOut();
        router.refresh();
        router.replace("/login");
      }}
    >
      {busy ? <BrandSpinner /> : <LogOut className="size-4" aria-hidden />}
      {busy ? "Signing out" : "Sign out"}
    </Button>
  );
}
