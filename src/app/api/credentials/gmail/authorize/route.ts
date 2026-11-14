import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import {
  buildGmailAuthUrl,
  createOAuthState,
  getAppUrl,
  getGmailRedirectUri,
} from "@/features/credentials/lib/gmail-oauth";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl(request);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  try {
    const redirectUri = getGmailRedirectUri(appUrl);

    // Logged so a `redirect_uri_mismatch` from Google can be traced to the
    // exact URI this deployment sent.
    console.info("Gmail OAuth redirect URI:", redirectUri);

    const state = createOAuthState(session.user.id, redirectUri);
    return NextResponse.redirect(buildGmailAuthUrl(state, redirectUri));
  } catch (error) {
    console.error("Gmail authorize error:", error);
    return NextResponse.redirect(
      new URL("/credentials/new?gmailError=not_configured", appUrl),
    );
  }
}
