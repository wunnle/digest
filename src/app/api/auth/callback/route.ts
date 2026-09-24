import { decodeJwt } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, setSession } from "@/server/session";

/** Emails allowed a session. Everyone else can read the page but not mark it. */
const allowed = () =>
  (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export async function GET(req: NextRequest) {
  const home = new URL("/", req.nextUrl.origin);
  const fail = (reason: string) => {
    const to = new URL(home);
    to.searchParams.set("auth", reason);
    const res = NextResponse.redirect(to);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get(STATE_COOKIE)?.value) return fail("error");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: new URL("/api/auth/callback", req.nextUrl.origin).toString(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail("error");

  // The ID token came straight from Google's token endpoint over TLS, in
  // exchange for our client secret — OIDC lets us trust it without checking
  // its signature (Core §3.1.3.7).
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) return fail("error");
  const claims = decodeJwt(id_token);
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";

  if (!claims.sub || !email || claims.email_verified !== true || !allowed().includes(email)) {
    return fail("denied");
  }

  const res = NextResponse.redirect(home);
  res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
  await setSession(res, { sub: claims.sub, email });
  return res;
}
