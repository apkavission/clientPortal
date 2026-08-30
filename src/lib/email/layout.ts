import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The frame every email from this application sits in.
 *
 * **The logo is in every one.** That is the owner's rule across the estate,
 * given on 2026-08-30, and it is not decoration: an email carrying credentials
 * that arrives looking like plain text from an unknown address is the exact
 * shape of a phishing message, and the first thing a careful person does with
 * one is not click it.
 *
 * Two things make that logo actually appear:
 *
 * **It is attached, not linked.** A `cid:` reference points at a part of the
 * message itself, so it renders before anybody presses "show images" — which
 * most people never press. A hosted URL would leave a broken box in the header
 * of the one email that most needs to look legitimate.
 *
 * **It sits on an explicit dark bar.** The mark is light ink. Left on the
 * client's own background it disappears in any inbox that forces a light
 * theme, and looks fine in testing because the tester's inbox happens to be
 * dark.
 *
 * Written as tables with inline styles because that is what email clients
 * support. It reads badly and it is correct; a modern layout here would look
 * right in a browser and collapse in Outlook.
 */

export const LOGO_CID = "apka-vission-logo";

const LOGO_PATH = join(process.cwd(), "public", "brand", "logo-email.png");

const BRAND = {
  pageBg: "#f4f5f7",
  headerBg: "#0b1220",
  cardBg: "#ffffff",
  border: "#e4e7ec",
  text: "#0b1220",
  textMuted: "#475467",
  textSubtle: "#667085",
  accent: "#0c6f6e",
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The mark, as an inline part. Read once and kept. */
let logoBytes: Buffer | null = null;

export async function logoAttachment() {
  logoBytes ??= await readFile(LOGO_PATH);
  return { filename: "apka-vission.png", content: logoBytes, cid: LOGO_CID };
}

/** Anything a person typed must not become markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface EmailLayout {
  /** The line the inbox shows beside the subject. */
  preheader: string;
  heading: string;
  intro?: string;
  /** Already-escaped HTML for the body of the card. */
  body: string;
}

export function renderEmail(options: EmailLayout): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};-webkit-font-smoothing:antialiased">

<!-- The inbox preview line, hidden in the message itself. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(options.preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.pageBg}">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate">

        <tr>
          <td align="center" style="background:${BRAND.headerBg};border-radius:12px 12px 0 0;padding:28px 24px 24px">
            <img src="cid:${LOGO_CID}" width="170" alt="Apka Vission"
                 style="display:block;width:170px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none">
          </td>
        </tr>

        <tr>
          <td style="background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-top:0;border-radius:0 0 12px 12px;padding:32px">
            <h1 style="margin:0;font:600 22px/1.3 ${FONT};color:${BRAND.text}">${escapeHtml(options.heading)}</h1>
            ${
              options.intro
                ? `<p style="margin:10px 0 0;font:400 15px/1.6 ${FONT};color:${BRAND.textMuted}">${escapeHtml(options.intro)}</p>`
                : ""
            }
            ${options.body}
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:20px 24px 0;font:400 12px/1.6 ${FONT};color:${BRAND.textSubtle}">
            Apka Saathi Private Limited
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

/** A row of label and value, for the sign-in details. */
export function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font:400 14px/1.5 ${FONT};color:${BRAND.textMuted};width:96px">${escapeHtml(label)}</td>
    <td style="padding:8px 0;font:600 14px/1.5 ${FONT};color:${BRAND.text}"><code style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace">${escapeHtml(value)}</code></td>
  </tr>`;
}

/** A button that still works where buttons are stripped. */
export function actionButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0">
    <tr>
      <td style="background:${BRAND.accent};border-radius:8px">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>
  <p style="margin:12px 0 0;font:400 13px/1.6 ${FONT};color:${BRAND.textSubtle}">If the button does not work, open this address: ${escapeHtml(href)}</p>`;
}
