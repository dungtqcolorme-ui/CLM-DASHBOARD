import "server-only";

import { createHash } from "node:crypto";
import {
  getGoogleAccess,
  GOOGLE_GMAIL_SEND_SCOPE,
  GoogleConnectionError,
  invalidateGoogleAccess,
} from "@/lib/googleOAuth";

const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

export class GmailSendError extends Error {
  status: number;
  retryable: boolean;
  ambiguous: boolean;

  constructor(
    message: string,
    status: number,
    retryable: boolean,
    ambiguous = false,
  ) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.ambiguous = ambiguous;
  }
}

export function validEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length <= 320 && EMAIL_PATTERN.test(email) ? email : "";
}

function safeHeader(value: string) {
  return value.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 998);
}

function encodedHeader(value: string) {
  const safe = safeHeader(value);
  return /^[\x20-\x7e]*$/.test(safe)
    ? safe
    : `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

function plainBody(value: string) {
  return String(value ?? "").replace(/\r?\n/g, "\r\n").replace(/\u0000/g, "");
}

function messageId(idempotencyKey: string) {
  return `<${createHash("sha256").update(idempotencyKey).digest("hex")}@clm-dashboard.local>`;
}

function rawMessage(input: {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey: string;
}) {
  const headers = [
    `From: ${encodedHeader(input.fromName)} <${input.fromEmail}>`,
    `To: ${input.to}`,
    `Subject: ${encodedHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId(input.idempotencyKey)}`,
    "MIME-Version: 1.0",
  ];
  let body = "";
  if (input.html) {
    const boundary = `clm_${createHash("sha256").update(`${input.idempotencyKey}:boundary`).digest("hex").slice(0, 30)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      plainBody(input.text),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      plainBody(input.html),
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    headers.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit");
    body = plainBody(input.text);
  }
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

function providerMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: { message?: unknown } }).error;
  return String(error?.message ?? fallback)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 1_000);
}

type GmailProviderPayload = {
  id?: string;
  error?: {
    message?: string;
    errors?: Array<{ reason?: string }>;
    details?: Array<{ reason?: string; metadata?: Record<string, unknown> }>;
  };
};

function providerReasons(payload: GmailProviderPayload) {
  const reasons = new Set<string>();
  for (const error of payload.error?.errors ?? []) {
    if (error.reason) reasons.add(error.reason);
  }
  for (const detail of payload.error?.details ?? []) {
    if (detail.reason) reasons.add(detail.reason);
    const metadataReason = detail.metadata?.reason;
    if (typeof metadataReason === "string") reasons.add(metadataReason);
  }
  return reasons;
}

async function requireGmailAccess() {
  try {
    const access = await getGoogleAccess([GOOGLE_GMAIL_SEND_SCOPE]);
    if (!access) throw new GmailSendError("Gmail hệ thống chưa được kết nối.", 503, false);
    return access;
  } catch (error) {
    if (error instanceof GmailSendError) throw error;
    const retryable = error instanceof GoogleConnectionError && error.code === "provider_error";
    throw new GmailSendError(
      error instanceof Error ? error.message : "Không làm mới được quyền Gmail.",
      503,
      retryable,
    );
  }
}

export async function sendGmail(input: {
  to: string;
  recipientName?: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey: string;
}) {
  const to = validEmail(input.to);
  if (!to) throw new GmailSendError("Email người nhận không hợp lệ.", 400, false);
  let access = await requireGmailAccess();
  let refreshedAfterUnauthorized = false;
  while (true) {
    const fromEmail = validEmail(access.accountEmail);
    if (!fromEmail) throw new GmailSendError("Email gửi hệ thống không hợp lệ.", 503, false);
    const raw = rawMessage({
      fromEmail,
      fromName: "CLM Dashboard",
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      idempotencyKey: input.idempotencyKey,
    });
    let response: Response;
    try {
      response = await fetch(GMAIL_SEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new GmailSendError(
        error instanceof Error ? `Không xác định được kết quả gửi Gmail: ${error.message.slice(0, 400)}` : "Không xác định được kết quả gửi Gmail.",
        0,
        false,
        true,
      );
    }
    const payload = await response.json().catch(() => ({})) as GmailProviderPayload;
    if (response.status === 401 && !refreshedAfterUnauthorized) {
      refreshedAfterUnauthorized = true;
      invalidateGoogleAccess();
      access = await requireGmailAccess();
      continue;
    }
    if (!response.ok || !payload.id) {
      const reasons = providerReasons(payload);
      const rateLimited = response.status === 403 && [
        "rateLimitExceeded",
        "userRateLimitExceeded",
        "quotaExceeded",
        "dailyLimitExceeded",
      ].some((reason) => reasons.has(reason));
      const ambiguous = response.status === 408 || response.status >= 500 || (response.ok && !payload.id);
      const retryable = response.status === 429 || rateLimited;
      throw new GmailSendError(
        providerMessage(payload, `Gmail từ chối yêu cầu (${response.status}).`),
        response.status,
        retryable,
        ambiguous,
      );
    }
    return { providerMessageId: payload.id };
  }
}
