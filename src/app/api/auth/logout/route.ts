import { NextResponse, type NextRequest } from "next/server";
import { clearSession } from "@/server/session";

/** POST only, so a stray link or prefetch can't sign you out. */
export function POST(req: NextRequest) {
  // 303 so the browser follows the form POST with a GET.
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin), 303);
  clearSession(res);
  return res;
}
