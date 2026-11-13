import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * gmail.send is the only write scope we need. `openid` + `email` let us read
 * back the connected address so we can show it in the UI and use it as From.
 */
export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
];

const STATE_TTL_MS = 10 * 60 * 1000;

export const getAppUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );

export const getGmailRedirectUri = () =>
  `${getAppUrl()}/api/credentials/gmail/callback`;

type GmailOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Reuses the Google OAuth client already configured for login when dedicated
 * Gmail credentials are not provided. The redirect URI below must be listed as
 * an authorised redirect URI on that client.
 */
export const getGmailOAuthConfig = (): GmailOAuthConfig => {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Gmail OAuth is not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (or GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri: getGmailRedirectUri(),
  };
};

const getStateSecret = () => {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY;

  if (!secret) {
    throw new Error(
      "Cannot sign OAuth state: set BETTER_AUTH_SECRET or ENCRYPTION_KEY.",
    );
  }

  return secret;
};

const sign = (payload: string) =>
  createHmac("sha256", getStateSecret()).update(payload).digest("base64url");

/**
 * The state is stateless: it carries the user id, an expiry and a nonce, and is
 * signed so the callback can trust it without a DB round-trip.
 */
export const createOAuthState = (userId: string) => {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      exp: Date.now() + STATE_TTL_MS,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
};

export const verifyOAuthState = (state: string): string | null => {
  const [payload, signature] = state.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { userId?: string; exp?: number };

    if (!data.userId || !data.exp || data.exp < Date.now()) {
      return null;
    }

    return data.userId;
  } catch {
    return null;
  }
};

export const buildGmailAuthUrl = (state: string) => {
  const { clientId, redirectUri } = getGmailOAuthConfig();
  const url = new URL(GOOGLE_AUTH_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  // offline + consent are both required to reliably receive a refresh token.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return url.toString();
};

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export class GmailOAuthError extends Error {
  code: string;

  constructor(code: string, detail: string) {
    super(`Google token exchange failed: ${code} ${detail}`);
    this.name = "GmailOAuthError";
    this.code = code;
  }
}

const requestToken = async (body: URLSearchParams) => {
  const { clientId, clientSecret } = getGmailOAuthConfig();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    let code = `http_${response.status}`;

    try {
      const parsed = JSON.parse(detail) as { error?: string };
      code = parsed.error || code;
    } catch {
      // Non-JSON error body; keep the status-based code.
    }

    throw new GmailOAuthError(code, detail);
  }

  return (await response.json()) as GoogleTokenResponse;
};

export const exchangeGmailCode = (code: string) => {
  const { redirectUri } = getGmailOAuthConfig();

  return requestToken(
    new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  );
};

export const refreshGmailAccessToken = (refreshToken: string) =>
  requestToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  );

export const fetchGmailAccountEmail = async (accessToken: string) => {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to read Google account: ${response.status}`);
  }

  const profile = (await response.json()) as { email?: string };

  if (!profile.email) {
    throw new Error("Google account did not return an email address");
  }

  return profile.email;
};

export type GmailCredentialPayload = {
  refreshToken: string;
  email: string;
  scope?: string;
};
