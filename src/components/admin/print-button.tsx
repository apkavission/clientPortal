"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Save this page as a PDF.
 *
 * `window.print()` and nothing more. Every browser offers "Save as PDF" in that
 * dialog, so this is the whole feature — and the file that comes out is exactly
 * what is on screen, which is the property a separate PDF template cannot have.
 */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden />
      Save as PDF
    </Button>
  );
}
