import "server-only";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";

/**
 * A stateless session: a signed JWT in an httpOnly cookie, and nothing stored
 * server-side. The only thing it needs to carry is who you are — `sub` keys the
 * marks in Redis, `email` is shown in the header.
 */

export const SESSION_COOKIE = "digest_session";
export const STATE_COOKIE = "digest_oauth_state";

const MAX_AGE = 60 * 60 * 24 * 30;

export type Session = { sub: string; email: string };

export const secure = process.env.NODE_ENV === "production";

// Read per call rather than at module load, so `next build` needs no env vars.
const key = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
};

export async function setSession(res: NextResponse, session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function readSession(req: NextRequest): Promise<Session | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    // Expired, tampered, or signed with a rotated secret — all just mean signed out.
    return null;
  }
}

export function clearSession(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}
