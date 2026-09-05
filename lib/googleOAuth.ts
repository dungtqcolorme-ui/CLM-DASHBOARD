import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const CONNECTION_ID = "primary";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TOKEN_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const TOKEN_INFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

export const GOOGLE_OAUTH_STATE_COOKIE = "clm_google_oauth_state";
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GOOGLE_REQUIRED_SCOPES = [
  "openid",
  "email",
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_GMAIL_SEND_SCOPE,
] as const;

type ConnectionStatus = "connected" | "expired" | "revoked";

type GoogleConnectionRow = {
  id: string;
  account_email: string;
  refresh_token_ciphertext: string;
  scopes: string[] | null;
  status: ConnectionStatus;
  last_error: string;
  updated_at: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type CachedGoogleAccess = {
  accessToken: string;
  accountEmail: string;
  scopes: string[];
  expiresAt: number;
};

let accessCache: CachedGoogleAccess | null = null;
let refreshPromise: Promise<CachedGoogleAccess | null> | null = null;
let connectionGeneration = 0;

export function invalidateGoogleAccess() {
  connectionGeneration += 1;
  accessCache = null;
  refreshPromise = null;
}

export class GoogleConnectionError extends Error {
  code: "not_configured" | "not_connected" | "missing_scope" | "expired" | "provider_error";

  constructor(
    message: string,
    code: "not_configured" | "not_connected" | "missing_scope" | "expired" | "provider_error",
  ) {
    super(message);
    this.code = code;
  }
}

function safeError(value: unknown, max = 2_000) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new GoogleConnectionError(`Thiếu cấu hình ${name}.`, "not_configured");
  return value;
}

function encryptionKey() {
  return createHash("sha256").update(requiredEnv("GOOGLE_TOKEN_ENCRYPTION_KEY")).digest();
}

export function encryptGoogleToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptGoogleToken(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new GoogleConnectionError("Refresh token Google không hợp lệ.", "expired");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function googleOAuthConfig(origin?: string) {
  const { clientId, clientSecret } = googleClientCredentials();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim()
    || (origin ? new URL("/api/google/calendar/oauth/callback", origin).toString() : "");
  if (!redirectUri) throw new GoogleConnectionError("Thiếu cấu hình GOOGLE_REDIRECT_URI.", "not_configured");
  return { clientId, clientSecret, redirectUri };
}

function googleClientCredentials() {
  return {
    clientId: requiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
  };
}

export function createGoogleOAuthState(userId: string) {
  const state = randomBytes(32).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1_000).toString(36);
  const payload = `${state}.${userId}.${issuedAt}`;
  const signature = createHmac("sha256", encryptionKey()).update(payload).digest("base64url");
  return { state, cookieValue: `${payload}.${signature}` };
}

export function verifyGoogleOAuthState(cookieValue: string, returnedState: string) {
  const [state, userId, issuedAt, signature] = cookieValue.split(".");
  if (!state || !userId || !issuedAt || !signature || state !== returnedState) return null;
  const payload = `${state}.${userId}.${issuedAt}`;
  const expected = createHmac("sha256", encryptionKey()).update(payload).digest("base64url");
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  const issuedAtSeconds = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(issuedAtSeconds) || Math.abs(Date.now() / 1_000 - issuedAtSeconds) > 10 * 60) return null;
  return { userId };
}

async function connectionRow() {
  const { data, error } = await getSupabaseAdmin()
    .from("email_connections")
    .select("id,account_email,refresh_token_ciphertext,scopes,status,last_error,updated_at")
    .eq("id", CONNECTION_ID)
    .maybeSingle<GoogleConnectionRow>();
  if (error) throw error;
  return data;
}

function configured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID
    && process.env.GOOGLE_CLIENT_SECRET
    && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  );
}

export async function googleConnectionStatus() {
  if (!configured()) {
    return {
      configured: false,
      connected: false,
      calendarConnected: false,
      gmailConnected: false,
      requiresReconnect: false,
      accountEmail: "",
      status: "revoked" as ConnectionStatus,
      scopes: [] as string[],
      lastError: "",
    };
  }
  const connection = await connectionRow();
  const scopes = connection?.scopes ?? [];
  const connected = connection?.status === "connected" && Boolean(connection.refresh_token_ciphertext);
  const calendarConnected = connected && scopes.includes(GOOGLE_CALENDAR_SCOPE);
  const gmailConnected = connected && scopes.includes(GOOGLE_GMAIL_SEND_SCOPE);
  return {
    configured: true,
    connected,
    calendarConnected,
    gmailConnected,
    requiresReconnect: connected && (!calendarConnected || !gmailConnected),
    accountEmail: connection?.account_email ?? "",
    status: connection?.status ?? "revoked",
    scopes,
    lastError: connection?.last_error ?? "",
  };
}

async function setConnectionFailure(
  status: ConnectionStatus,
  message: string,
  expectedUpdatedAt: string,
) {
  const { data, error } = await getSupabaseAdmin().from("email_connections").update({
    status,
    last_error: safeError(message),
  })
    .eq("id", CONNECTION_ID)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  if (!data) return false;
  invalidateGoogleAccess();
  return true;
}

async function refreshGoogleAccess(generation: number) {
  const connection = await connectionRow();
  if (generation !== connectionGeneration) return null;
  if (!connection?.refresh_token_ciphertext || connection.status !== "connected") return null;
  const scopes = connection.scopes ?? [];

  let refreshToken = "";
  try {
    refreshToken = decryptGoogleToken(connection.refresh_token_ciphertext);
  } catch (error) {
    if (generation !== connectionGeneration) return null;
    const applied = await setConnectionFailure(
      "expired",
      error instanceof Error ? error.message : "Không giải mã được Google token.",
      connection.updated_at,
    );
    if (!applied) return null;
    throw error;
  }
  const { clientId, clientSecret } = googleClientCredentials();
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    if (generation !== connectionGeneration) return null;
    throw new GoogleConnectionError(
      error instanceof Error ? `Không kết nối được Google OAuth: ${safeError(error.message, 400)}` : "Không kết nối được Google OAuth.",
      "provider_error",
    );
  }
  const payload = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    if (generation !== connectionGeneration) return null;
    const message = safeError(payload.error_description || payload.error || "Không làm mới được quyền Google.");
    const expired = payload.error === "invalid_grant" || response.status === 400;
    const applied = await setConnectionFailure(
      expired ? "expired" : "connected",
      message,
      connection.updated_at,
    );
    if (!applied) return null;
    throw new GoogleConnectionError(message, expired ? "expired" : "provider_error");
  }
  if (generation !== connectionGeneration) return null;
  const { data: refreshedConnection, error: refreshError } = await getSupabaseAdmin().from("email_connections").update({
    status: "connected",
    last_error: "",
    last_refreshed_at: new Date().toISOString(),
  })
    .eq("id", CONNECTION_ID)
    .eq("updated_at", connection.updated_at)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (refreshError) throw refreshError;
  if (!refreshedConnection || generation !== connectionGeneration) return null;
  const reportedLifetime = Number(payload.expires_in ?? 3_600);
  const tokenLifetime = Math.max(5, Math.min(
    60,
    (Number.isFinite(reportedLifetime) ? reportedLifetime : 3_600) - 60,
  ));
  accessCache = {
    accessToken: payload.access_token,
    accountEmail: connection.account_email,
    scopes,
    expiresAt: Date.now() + tokenLifetime * 1_000,
  };
  return accessCache;
}

export async function getGoogleAccess(requiredScopes: string[]) {
  let access = accessCache
    && accessCache.expiresAt > Date.now()
    && requiredScopes.every((scope) => accessCache?.scopes.includes(scope))
    ? accessCache
    : null;
  if (!access) {
    for (let refreshAttempt = 0; refreshAttempt < 2 && !access; refreshAttempt += 1) {
      const generation = connectionGeneration;
      if (!refreshPromise) {
        const pending = refreshGoogleAccess(generation);
        refreshPromise = pending;
        void pending.finally(() => {
          if (refreshPromise === pending) refreshPromise = null;
        }).catch(() => undefined);
      }
      access = await refreshPromise;
      if (!access && generation === connectionGeneration) break;
    }
  }
  if (!access) return null;
  const missingScopes = requiredScopes.filter((scope) => !access.scopes.includes(scope));
  if (missingScopes.length) {
    throw new GoogleConnectionError("Kết nối Google cần được cấp quyền lại.", "missing_scope");
  }
  return { accessToken: access.accessToken, accountEmail: access.accountEmail };
}

export async function exchangeGoogleAuthorizationCode(code: string, origin: string) {
  const { clientId, clientSecret, redirectUri } = googleOAuthConfig(origin);
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const tokens = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !tokens.access_token || !tokens.refresh_token) {
    throw new GoogleConnectionError(
      safeError(tokens.error_description || tokens.error || "Google không cấp refresh token. Hãy thử kết nối lại."),
      "provider_error",
    );
  }
  let scopes = String(tokens.scope ?? "").split(/\s+/).filter(Boolean);
  if (!scopes.length) {
    const infoResponse = await fetch(`${TOKEN_INFO_ENDPOINT}?access_token=${encodeURIComponent(tokens.access_token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const info = await infoResponse.json().catch(() => ({})) as { scope?: string };
    scopes = String(info.scope ?? "").split(/\s+/).filter(Boolean);
  }
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, scopes };
}

export async function saveGoogleConnection(input: {
  accountEmail: string;
  refreshToken: string;
  scopes: string[];
  connectedBy: string;
}) {
  invalidateGoogleAccess();
  const normalizedScopes = [...new Set(input.scopes.map((scope) => scope.trim()).filter(Boolean))];
  const missing = [GOOGLE_CALENDAR_SCOPE, GOOGLE_GMAIL_SEND_SCOPE]
    .filter((scope) => !normalizedScopes.includes(scope));
  if (missing.length) {
    throw new GoogleConnectionError("Google chưa cấp đủ quyền Calendar và Gmail. Vui lòng kết nối lại.", "missing_scope");
  }
  const encryptedRefreshToken = encryptGoogleToken(input.refreshToken);
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("email_connections").upsert({
    id: CONNECTION_ID,
    provider: "gmail",
    purpose: "system",
    connected_by: input.connectedBy,
    account_email: input.accountEmail.trim().toLowerCase(),
    refresh_token_ciphertext: encryptedRefreshToken,
    scopes: normalizedScopes,
    status: "connected",
    last_error: "",
  });
  if (error) throw error;

  // Keep the legacy row in sync for one release so a rollback does not break Calendar.
  await admin.from("google_calendar_integrations").upsert({
    id: CONNECTION_ID,
    google_account_email: input.accountEmail.trim().toLowerCase(),
    refresh_token_ciphertext: encryptedRefreshToken,
    scopes: normalizedScopes,
    updated_at: new Date().toISOString(),
  });
}

export async function disconnectGoogleConnection() {
  invalidateGoogleAccess();
  const connection = await connectionRow();
  let providerRevoked = false;
  let providerError = "";
  if (connection?.refresh_token_ciphertext) {
    try {
      const refreshToken = decryptGoogleToken(connection.refresh_token_ciphertext);
      const response = await fetch(TOKEN_REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      providerRevoked = response.ok || response.status === 400;
      if (!providerRevoked) providerError = `Google trả mã ${response.status} khi thu hồi quyền.`;
    } catch (error) {
      providerError = error instanceof Error ? safeError(error.message, 400) : "Không gọi được Google revoke endpoint.";
    }
  }
  const { error } = await getSupabaseAdmin().from("email_connections").update({
    refresh_token_ciphertext: "",
    scopes: [],
    status: "revoked",
    last_error: providerError,
  }).eq("id", CONNECTION_ID);
  if (error) throw error;
  await getSupabaseAdmin().from("google_calendar_integrations").update({
    refresh_token_ciphertext: "",
    scopes: [],
    updated_at: new Date().toISOString(),
  }).eq("id", CONNECTION_ID);
  return { disconnected: true, providerRevoked, providerError };
}
