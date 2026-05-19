import { Resend } from "resend";

import { observabilityLog } from "@/lib/observability/log";

export function isResendConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim(),
  );
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export interface SendEmailInput {
  to: string[];
  subject: string;
  html: string;
}

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; skipped?: boolean };

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const recipients = input.to
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes("@"));

  if (recipients.length === 0) {
    return { ok: false, error: "No valid recipients." };
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from || !process.env.RESEND_API_KEY?.trim()) {
    observabilityLog.info("email.resend.skipped", {
      reason: "not_configured",
      subject: input.subject,
      recipientCount: recipients.length,
    });
    return {
      ok: false,
      error: "Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).",
      skipped: true,
    };
  }

  const resend = getResendClient();
  if (!resend) {
    return { ok: false, error: "Resend client unavailable." };
  }

  const { data, error } = await resend.emails.send({
    from,
    to: recipients,
    subject: input.subject,
    html: input.html,
  });

  if (error) {
    observabilityLog.warn("email.resend.failed", {
      subject: input.subject,
      message: error.message,
    });
    return { ok: false, error: error.message };
  }

  return { ok: true, id: data?.id };
}
