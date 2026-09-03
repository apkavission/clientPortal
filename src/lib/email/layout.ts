import "server-only";

import { resolveEmailLogo } from "@/lib/email/logo";
import type { MailAttachment } from "@/lib/email/mailer";

/**
 * The shared shell every outgoing email is rendered into.
 *
 * Email is not the web. Layout is tables rather than flex or grid, styles are
 * inline rather than in a sheet, and nothing depends on a class surviving the
 * trip — Gmail rewrites the document, Outlook renders through Word, and both
 * discard most of what a browser would honour. The one `<style>` block carries
 * only the mobile media query, which cannot be expressed inline, and the
 * layout is built so that dropping it entirely still leaves a readable email.
 *
 * Every colour is stated explicitly, including backgrounds. A client that
 * forces dark mode inverts what it can infer, so an unstated background is the
 * usual reason a logo ends up on a colour nobody chose.
 */

const BRAND = {
  /** The dark bar the light-ink logo sits on, so it reads in either mode. */
  headerBg: "#0e1218",
  pageBg: "#f4f5f7",
  cardBg: "#ffffff",
  border: "#e4e7ec",
  text: "#0b1220",
  textMuted: "#475467",
  textSubtle: "#667085",
  accent: "#0e7c7b",
} as const;

const LOGO_CID = "apka-vission-logo";

/**
 * The logo travels with the message, so it renders without "show images".
 *
 * Rendered from whatever logo is configured in settings rather than a fixed
 * file, so the brand stays editable without a deploy.
 */
export async function logoAttachment(): Promise<MailAttachment> {
  const logo = await resolveEmailLogo();
  return { filename: logo.filename, content: logo.png, cid: LOGO_CID };
}

export interface EmailBrand {
  /** Trading name shown under the logo. */
  companyName: string;
  /** Registered entity, shown in the footer. */
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLines?: string[];
  siteUrl: string;
}

export interface EmailLayoutOptions {
  /** The inbox preview line. Shown next to the subject before opening. */
  preheader: string;
  heading: string;
  /** Optional sentence under the heading. */
  intro?: string;
  /** Label/value pairs rendered as a definition table. */
  rows?: Array<[string, string]>;
  /** Free-text blocks rendered after the table, in order. */
  blocks?: Array<{ label: string; body: string }>;
  /** A numbered "what happens next" list, rendered above the detail table. */
  steps?: Array<{ title: string; body: string }>;
  /** One call to action. More than one dilutes both. */
  button?: { label: string; href: string };
  /** Quick contact links rendered as a row under the button. */
  links?: Array<{ label: string; href: string }>;
  /** Small print above the footer rule. */
  note?: string;
  brand: EmailBrand;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Turns newlines into `<br>` after escaping, so pasted text keeps its shape. */
function withBreaks(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

export function renderEmail(options: EmailLayoutOptions): string {
  const { brand } = options;

  const rows = (options.rows ?? [])
    .map(
      ([label, value], index) => `
      <tr>
        <td class="stack" style="padding:${index === 0 ? "0" : "10px"} 16px 0 0;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.textSubtle};vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>
        <td class="stack" style="padding:${index === 0 ? "0" : "10px"} 0 0 0;font:600 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text};vertical-align:top">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join("");

  const blocks = (options.blocks ?? [])
    .map(
      (block) => `
      <tr>
        <td style="padding:26px 0 0 0">
          <p style="margin:0 0 6px;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.textSubtle}">${escapeHtml(block.label)}</p>
          <div style="margin:0;padding:14px 16px;background:${BRAND.pageBg};border-left:3px solid ${BRAND.accent};border-radius:6px;font:400 14px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text}">${withBreaks(block.body)}</div>
        </td>
      </tr>`,
    )
    .join("");

  /*
    Numbered steps. Each row is its own table so the number stays beside its
    text at any width — a floated or absolutely positioned badge would collapse
    in Outlook, which lays the document out through Word.
  */
  const steps = (options.steps ?? [])
    .map(
      (step, index) => `
      <tr>
        <td style="padding:${index === 0 ? "0" : "14px"} 0 0 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="28" valign="top" style="width:28px;padding-top:1px">
                <div style="width:22px;height:22px;border-radius:11px;background:${BRAND.accent};color:#ffffff;text-align:center;font:600 12px/22px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${index + 1}</div>
              </td>
              <td valign="top" style="padding-left:10px">
                <p style="margin:0;font:600 14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text}">${escapeHtml(step.title)}</p>
                <p style="margin:2px 0 0;font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.textMuted}">${escapeHtml(step.body)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
    )
    .join("");

  /*
    Button as a table cell with a background, not a styled anchor. Outlook
    ignores padding on inline elements, so an anchor alone renders as bare
    text; the padding has to sit on the cell.
  */
  const button = options.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px">
        <tr>
          <td align="center" style="background:${BRAND.accent};border-radius:8px">
            <a href="${escapeHtml(options.button.href)}"
               style="display:inline-block;padding:13px 26px;font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none">${escapeHtml(options.button.label)}</a>
          </td>
        </tr>
      </table>`
    : "";

  const links = (options.links ?? []).length
    ? `<p style="margin:18px 0 0;font:400 13px/1.7 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.textMuted}">${(
        options.links ?? []
      )
        .map(
          (link) =>
            `<a href="${escapeHtml(link.href)}" style="color:${BRAND.accent};text-decoration:none;font-weight:600">${escapeHtml(link.label)}</a>`,
        )
        .join(" &nbsp;·&nbsp; ")}</p>`
    : "";

  const footerAddress = (brand.addressLines ?? []).filter(Boolean);

  const footerContact = [
    brand.email
      ? `<a href="mailto:${escapeHtml(brand.email)}" style="color:${BRAND.accent};text-decoration:none">${escapeHtml(brand.email)}</a>`
      : null,
    brand.phone ? escapeHtml(brand.phone) : null,
  ]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(options.heading)}</title>
<style>
  /* The only rule that cannot be inlined. Clients that strip it fall back to
     the two-column table, which stays readable down to about 320px. */
  @media only screen and (max-width:480px) {
    .wrap { padding: 16px 12px !important; }
    .card-pad { padding: 24px 20px !important; }
    .stack { display: block !important; width: 100% !important; padding-right: 0 !important; white-space: normal !important; }
    .stack + .stack { padding-top: 2px !important; }
    .h1 { font-size: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};-webkit-font-smoothing:antialiased">

<!-- Preheader: the inbox preview line. Hidden in the body itself. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(options.preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.pageBg}">
  <tr>
    <td class="wrap" align="center" style="padding:32px 16px">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate">

        <!-- Header: logo on an explicit dark bar, so the light-ink mark reads
             the same whether or not the client forces dark mode. -->
        <tr>
          <td align="center" style="background:${BRAND.headerBg};border-radius:12px 12px 0 0;padding:28px 24px 24px">
            <img src="cid:${LOGO_CID}" width="170" alt="${escapeHtml(brand.companyName)}"
                 style="display:block;width:170px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none">
          </td>
        </tr>

        <tr>
          <td class="card-pad" style="background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-top:0;border-radius:0 0 12px 12px;padding:32px 32px 28px">

            <h1 class="h1" style="margin:0;font:600 22px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text}">${escapeHtml(options.heading)}</h1>
            ${
              options.intro
                ? `<p style="margin:10px 0 0;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.textMuted}">${escapeHtml(options.intro)}</p>`
                : ""
            }

            ${
              steps
                ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px">${steps}</table>`
                : ""
            }

            ${button}
            ${links}

            ${
              rows
                ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:1px solid ${BRAND.border};padding-top:20px">
              <tr><td colspan="2" style="height:20px;line-height:20px;font-size:0">&nbsp;</td></tr>
              ${rows}
            </table>`
                : ""
            }

            ${blocks ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${blocks}</table>` : ""}

            ${
              options.note
                ? `<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid ${BRAND.border};font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.textSubtle}">${escapeHtml(options.note)}</p>`
                : ""
            }
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:24px 24px 8px">
            <p style="margin:0;font:600 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text}">${escapeHtml(brand.companyName)}</p>
            ${
              brand.legalName && brand.legalName !== brand.companyName
                ? `<p style="margin:3px 0 0;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.textSubtle}">A unit of ${escapeHtml(brand.legalName)}</p>`
                : ""
            }
            ${
              footerAddress.length
                ? `<p style="margin:8px 0 0;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.textSubtle}">${footerAddress.map(escapeHtml).join("<br>")}</p>`
                : ""
            }
            ${
              footerContact
                ? `<p style="margin:8px 0 0;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.textSubtle}">${footerContact}</p>`
                : ""
            }
            <p style="margin:12px 0 0;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
              <a href="${escapeHtml(brand.siteUrl)}" style="color:${BRAND.accent};text-decoration:none">${escapeHtml(brand.siteUrl.replace(/^https?:\/\//, ""))}</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
