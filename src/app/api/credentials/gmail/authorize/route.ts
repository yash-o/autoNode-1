import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  buildGmailAuthUrl,
  createOAuthState,
  getAppUrl,
} from "@/features/credentials/lib/gmail-oauth";
import { auth } from "@/lib/auth";

export async function GET() {
  const appUrl = getAppUrl();

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  try {
    const state = createOAuthState(session.user.id);
    return NextResponse.redirect(buildGmailAuthUrl(state));
  } catch (error) {
    console.error("Gmail authorize error:", error);
    return NextResponse.redirect(
      new URL("/credentials/new?gmailError=not_configured", appUrl),
    );
  }
}
