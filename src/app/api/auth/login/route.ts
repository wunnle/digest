import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, secure } from "@/server/session";

/**
 * Starts Google's OAuth code flow. `state` round-trips through a short-lived
 * cookie so the callback can reject a response it didn't ask for.
 */
export function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return new NextResponse("GOOGLE_CLIENT_ID is not set", { status: 500 });

  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: new URL("/api/auth/callback", req.nextUrl.origin).toString(),
    response_type: "code",
    scope: "openid email",
    state,
    // Always show the picker, so a denied account isn't silently reused on retry.
    prompt: "select_account",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 60 * 10,
  });
  return res;
}
