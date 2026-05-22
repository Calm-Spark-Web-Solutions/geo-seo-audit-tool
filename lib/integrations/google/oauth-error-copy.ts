/**
 * Plain-language explanations for Google OAuth `reason` codes shown on
 * `/integrations/google?google=error&reason=...`. Anything not on the list
 * falls back to a generic friendly message so we never expose raw error
 * strings to non-technical users.
 */

export type FriendlyOAuthError = {
  title: string;
  description: string;
};

const MAP: Record<string, FriendlyOAuthError> = {
  invalid_state: {
    title: "Connection link expired",
    description:
      "The Google connection link is no longer valid. Click Connect Google to try again.",
  },
  missing_code: {
    title: "Google didn't send a confirmation",
    description:
      "We didn't receive a confirmation from Google. Click Connect Google to try again.",
  },
  session: {
    title: "Please sign in again",
    description:
      "Your sign-in expired while we were waiting on Google. Refresh the page and try connecting again.",
  },
  no_refresh_token: {
    title: "Permission wasn't fully granted",
    description:
      "Google didn't give us long-term access. Click Connect Google again and make sure to check every permission box on Google's screen.",
  },
  access_denied: {
    title: "Connection cancelled",
    description:
      "You cancelled the Google sign-in. Click Connect Google to try again.",
  },
  oauth_failed: {
    title: "Google connection failed",
    description:
      "Something went wrong on Google's side. Click Connect Google to try again — if it keeps happening, contact support.",
  },
};

const TOKEN_REFRESH_PATTERNS = [
  /refresh.*google.*token/i,
  /token.*revoked/i,
  /invalid_grant/i,
];

/** Translate a raw `?reason=` value into something a non-tech user understands. */
export function friendlyOAuthErrorForReason(
  reason: string | null | undefined,
): FriendlyOAuthError {
  const key = reason?.trim().toLowerCase() ?? "";
  if (key && MAP[key]) return MAP[key];
  return {
    title: "Google connection failed",
    description:
      "We couldn't finish setting up Google. Click Connect Google to try again — if it keeps happening, contact support.",
  };
}

/** Convert a stored `last_error` from a token refresh into friendly copy. */
export function friendlyTokenRefreshError(
  lastError: string | null | undefined,
): FriendlyOAuthError | null {
  if (!lastError?.trim()) return null;
  const looksLikeRefresh = TOKEN_REFRESH_PATTERNS.some((re) =>
    re.test(lastError),
  );
  if (looksLikeRefresh) {
    return {
      title: "Google needs to be reconnected",
      description:
        "Your Google sign-in has expired or was revoked. Click Reconnect Google to restore Search Console and Analytics data.",
    };
  }
  return {
    title: "Google needs to be reconnected",
    description:
      "We hit an error talking to Google last time. Click Reconnect Google to refresh the connection.",
  };
}
