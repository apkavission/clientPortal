import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { logoAttachment, renderEmail, type EmailBrand } from "@/lib/email/layout";

/**
 * Who these emails are from, in the footer.
 *
 * Stated once here rather than in each message. The company website reads the
 * same fields out of its settings table; this application has none, so this
 * constant is the one place an address changes.
 */
const BRAND: EmailBrand = {
  companyName: "Apka Vission",
  legalName: "Apka Saathi Private Limited",
  email: "hello@apkavission.com",
  siteUrl: "https://apkavission.com",
};

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
  /**
   * A new password, or `null` when this person already has an account.
   *
   * `null` rather than a sentence. The callers used to pass the literal string
   * "(the password you already use)", which read correctly in the row and then
   * ran straight into the note beneath it — so an existing client was told
   * their password was temporary and to change it. A type that can express
   * "there is no new password" is what lets this message say the right thing
   * instead of being handed a phrase and printing it.
   */
  password: string | null;
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

  /*
    Whether this message is handing over a password or naming an existing one.

    Both are ordinary: a client's second project, or a developer added to
    another one, already has a login. Getting this wrong is not cosmetic — the
    note underneath used to say "that password is temporary, please change it"
    in both cases, so somebody who had been signing in for months was told to
    change a password that had just been described to them as the one they
    already use.
  */
  const isNew = input.password !== null;

  const passwordLine = isNew
    ? `Password: ${input.password}`
    : "Password: the one you already use for this account.";

  const passwordNote = isNew
    ? "That password is temporary. Please sign in and change it — there is a link for it on your account page."
    : "Your password has not changed. If you have forgotten it, there is a reset link on the sign-in screen.";

  const text = [
    `Hello ${input.name},`,
    "",
    opening,
    "",
    `You can follow it here: ${input.trackerUrl}`,
    "",
    `Email:    ${input.email}`,
    passwordLine,
    "",
    passwordNote,
    "",
    "Apka Saathi Private Limited",
  ].join("\n");

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
      intro: `Hello ${input.name}. ${opening}`,

      /*
        The button before the credentials, deliberately.

        Somebody reading an email that contains a password decides whether it is
        genuine in the first two seconds. What happened and where to go answers
        that; a password quoted at them before either does not.
      */
      button: { label: "Open the tracker", href: input.trackerUrl },

      /*
        `rows`, rather than the hand-built two-column table this used to be.

        That table was the half of this message that was not responsive: two
        hard columns squeezed the password to a few characters wide on a phone —
        the one value here that has to be readable and copyable. The shared
        frame stacks the label above the value below 480px, which is what its
        `.stack` rule exists for.
      */
      rows: [
        ["Email", input.email],
        [
          "Password",
          isNew ? (input.password as string) : "the one you already use for this account",
        ],
      ],

      note: passwordNote,
      brand: BRAND,
    }),
    attachments: [await logoAttachment()],
  };
}
