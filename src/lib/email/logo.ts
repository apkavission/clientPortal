import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The logo, for email.
 *
 * ---------------------------------------------------------------------------
 * **Attached, not linked.** A `cid:` reference points at a part of the message
 * itself, so the mark renders before anybody presses "show images" — which most
 * people never press. A hosted URL leaves a broken box in the header of the one
 * email that most needs to look legitimate, and an email carrying sign-in
 * details that arrives looking like plain text from an unknown address is the
 * exact shape of a phishing message.
 *
 * ---------------------------------------------------------------------------
 * **A PNG, not the SVG.** Mail clients do not render SVG; Gmail strips it.
 *
 * ---------------------------------------------------------------------------
 * **Why this is simpler than the website's version of the same file.**
 *
 * There, the logo follows whatever is configured in site settings and a vector
 * is rasterised on the way out, so changing the logo in the admin changes it in
 * every email without a deploy. This application has no settings table and no
 * image pipeline, and growing both to send two emails would be the wrong trade.
 * It reads the committed PNG, which is the same mark.
 */

const LOGO_PATH = join(process.cwd(), "public", "brand", "logo-email.png");

let cached: Buffer | null = null;

export interface EmailLogo {
  png: Buffer;
  filename: string;
}

export async function resolveEmailLogo(): Promise<EmailLogo> {
  /* Read once and kept: the file does not change while the process runs. */
  cached ??= await readFile(LOGO_PATH);

  return { png: cached, filename: "logo.png" };
}
