import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import {
  exchangeGmailCode,
  fetchGmailAccountEmail,
  type GmailCredentialPayload,
  GmailOAuthError,
  getAppUrl,
  verifyOAuthState,
} from "@/features/credentials/lib/gmail-oauth";
import { CredentialType } from "@/generated/prisma";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/encryption";

const failure = (appUrl: string, reason: string, detail?: string) => {
  const params = new URLSearchParams({ gmailError: reason });

  if (detail) {
    params.set("gmailErrorDetail", detail.slice(0, 300));
  }

  return NextResponse.redirect(
    new URL(`/credentials/new?${params.toString()}`, appUrl),
  );
};

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const url = new URL(request.url);

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Surface Google's own error code and description instead of collapsing
  // every failure into a generic message.
  if (error) {
    return failure(
      appUrl,
      error,
      url.searchParams.get("error_description") ?? undefined,
    );
  }

  if (!code || !state) {
    return failure(appUrl, "invalid_request");
  }

  const userId = verifyOAuthState(state);

  if (!userId) {
    return failure(appUrl, "invalid_state");
  }

  // The signed state carries the user id, but the browser must still be that
  // user — otherwise a leaked state could bind an account to someone else.
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.id !== userId) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  try {
    const tokens = await exchangeGmailCode(code);

    if (!tokens.refresh_token) {
      return failure(appUrl, "missing_refresh_token");
    }

    if (!tokens.scope.includes("gmail.send")) {
      return failure(appUrl, "missing_scope");
    }

    const email = await fetchGmailAccountEmail(tokens.access_token);

    const payload: GmailCredentialPayload = {
      refreshToken: tokens.refresh_token,
      email,
      scope: tokens.scope,
    };

    await prisma.credential.create({
      data: {
        name: `Gmail (${email})`,
        type: CredentialType.GMAIL,
        userId,
        value: encrypt(JSON.stringify(payload)),
      },
    });

    return NextResponse.redirect(new URL("/credentials", appUrl));
  } catch (callbackError) {
    console.error("Gmail callback error:", callbackError);

    if (callbackError instanceof GmailOAuthError) {
      return failure(appUrl, callbackError.code, callbackError.message);
    }

    return failure(appUrl, "exchange_failed");
  }
}
