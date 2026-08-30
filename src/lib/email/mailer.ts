import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import {
  actionButton,
  detailRow,
  escapeHtml,
  logoAttachment,
  renderEmail,
} from "@/lib/email/layout";

/**
 * Outbound mail, over our own SMTP.
 *
 * Deliberately not a sending API. The only thing needed is credentials for a
 * mailbox on a domain we control, which means no per-message cost, no vendor
 * holding client details, and no second place to revoke access when somebody
 * leaves.
 *
 * Two rules shape this, and both matter more here than in a marketing form.
 *
 * **Sending never throws.** The accounts are created before any mail is
 * attempted, so a refused connection must not leave a project with two logins
 * in the database and an error page on screen. Failures come back as a value.
 *
 * **Unconfigured is a valid state.** With `SMTP_HOST` blank the message is
 * logged rather than sent, so the whole approval flow can be walked through on
 * a machine with no credentials — and the log line includes the password, which
 * is exactly what somebody testing needs and exactly why this must never run
 * with a real client's address on a shared machine.
 */

export interface MailAttachment {
  filename: string;
  content: Buffer;
  /** Makes it an inline part the HTML can reference as `src="cid:the-id"`. */
  cid?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

export type MailResult =
  | { sent: true }
  | { sent: false; reason: "not-configured" | "failed"; error?: string };

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: (process.env.SMTP_SECURE ?? "true") === "true",
      auth: {
        user: process.env.SMTP_USER ?? "",
        pass: process.env.SMTP_PASS ?? "",
      },
    });
  }

  return transporter;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const mailer = getTransporter();

  if (!mailer) {
    console.info(
      `[mail] SMTP is not configured, so nothing was sent.\n  to: ${message.to}\n  subject: ${message.subject}\n${message.text}`,
    );
    return { sent: false, reason: "not-configured" };
  }

  try {
    await mailer.sendMail({
      from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
    });
    return { sent: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[mail] send failed for "${message.subject}": ${detail}`);
    return { sent: false, reason: "failed", error: detail };
  }
}

/**
 * The message somebody gets when a project they are on is approved.
 *
 * **Carries the logo**, like every email from the estate — attached rather than
 * linked, so it appears without anybody pressing "show images". An email that
 * hands out credentials and arrives looking like plain text from an address
 * nobody recognises is the exact shape of a phishing message, and the careful
 * response to one is to ignore it.
 *
 * Sent as HTML and as plain text together. The text version is not a fallback
 * nobody sees: it is what a screen reader in a plain-text client reads, and what
 * survives a corporate mail filter that strips HTML.
 *
 * **The password is in the message.** A deliberate trade, and worth being clear
 * about: a reset link is more secure and adds a step that a first-time client
 * with no account has to complete before they can see anything at all. The
 * password is temporary, the email says so, and changing it is the first thing
 * the tracker offers.
 */
export async function buildAccountEmail(input: {
  name: string;
  email: string;
  password: string;
  projectName: string;
  trackerUrl: string;
  role: "client" | "developer";
}): Promise<MailMessage> {
  const opening =
    input.role === "client"
      ? `Your project "${input.projectName}" has been approved and set up.`
      : `You have been assigned to "${input.projectName}".`;

  const heading =
    input.role === "client" ? "Your project is set up" : "You are on a new project";

  const text = [
    `Hello ${input.name},`,
    "",
    opening,
    "",
    `You can follow it here: ${input.trackerUrl}`,
    "",
    `Email:    ${input.email}`,
    `Password: ${input.password}`,
    "",
    "That password is temporary. Please sign in and change it — there is a link for it on your account page.",
    "",
    "Apka Saathi Private Limited",
  ].join("\n");

  const body = `
    <p style="margin:20px 0 0;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1220">${escapeHtml(opening)}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;width:100%">
      ${detailRow("Email", input.email)}
      ${detailRow("Password", input.password)}
    </table>

    <p style="margin:16px 0 0;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#667085">
      That password is temporary. Please sign in and change it — there is a link for it on your account page.
    </p>

    ${actionButton(input.trackerUrl, "Open the tracker")}
  `;

  return {
    to: input.email,
    subject:
      input.role === "client"
        ? `Your project is set up — ${input.projectName}`
        : `You are on ${input.projectName}`,
    text,
    html: renderEmail({
      preheader: opening,
      heading,
      intro: `Hello ${input.name},`,
      body,
    }),
    attachments: [await logoAttachment()],
  };
}
