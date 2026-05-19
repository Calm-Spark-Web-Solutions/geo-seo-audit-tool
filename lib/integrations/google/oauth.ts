import {
  GOOGLE_OAUTH_SCOPES,
  googleOAuthClientId,
  googleOAuthClientSecret,
  googleOAuthRedirectUri,
} from "./config";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: googleOAuthClientId(),
    redirect_uri: googleOAuthRedirectUri(),
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: googleOAuthClientId(),
    client_secret: googleOAuthClientSecret(),
    redirect_uri: googleOAuthRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: googleOAuthClientId(),
    client_secret: googleOAuthClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function revokeGoogleToken(token: string): Promise<void> {
  const res = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google revoke failed: ${res.status} ${text}`);
  }
}

/** Best-effort email from userinfo (optional scope — may fail). */
export async function fetchGoogleAccountEmail(
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email?.trim() || null;
  } catch {
    return null;
  }
}
