export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim(),
  );
}

export function googleOAuthClientId(): string {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!id) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");
  return id;
}

export function googleOAuthClientSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET is not configured");
  return secret;
}

export function googleOAuthRedirectUri(): string {
  const uri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (!uri) throw new Error("GOOGLE_OAUTH_REDIRECT_URI is not configured");
  return uri;
}
