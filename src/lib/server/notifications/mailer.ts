import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env, mailConfigured } from "../env";
import { sql } from "../db";

export type OutgoingMessage = { to: string; subject: string; text: string; html: string; messageId: string };
export type SendResult = { status: "sent" | "captured"; providerMessageId: string | null };

let transporter: Transporter | undefined;

/** Test hook: drop the cached SMTP transport after env changes. */
export function resetTransportForTests() {
  transporter = undefined;
}

function smtp(): Transporter {
  if (!transporter) {
    const e = env();
    transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT ?? 587,
      secure: e.SMTP_SECURE ?? false,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

export function mailMode(): "smtp" | "devmailbox" | "smtp-misconfigured" {
  const e = env();
  if (e.MAIL_DRIVER === "devmailbox") return "devmailbox";
  return mailConfigured() ? "smtp" : "smtp-misconfigured";
}

/**
 * Sends via SMTP, or captures to the development mailbox. Throws on failure so
 * the worker can retry. A captured message is reported as "captured", never as
 * "sent".
 */
export async function deliver(msg: OutgoingMessage, jobId: number): Promise<SendResult> {
  const mode = mailMode();
  if (mode === "devmailbox") {
    await sql()`
      INSERT INTO dev_mailbox (job_id, recipient, subject, text_body, html_body)
      VALUES (${jobId}, ${msg.to}, ${msg.subject}, ${msg.text}, ${msg.html})`;
    return { status: "captured", providerMessageId: null };
  }
  if (mode === "smtp-misconfigured") {
    throw new Error("MAIL_DRIVER=smtp but SMTP_HOST or MAIL_FROM is not set");
  }
  const info = await smtp().sendMail({
    from: env().MAIL_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    messageId: msg.messageId,
  });
  return { status: "sent", providerMessageId: info.messageId ?? null };
}
