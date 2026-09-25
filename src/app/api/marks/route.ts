import { NextResponse, type NextRequest } from "next/server";
import { redis } from "@/server/redis";
import { readSession } from "@/server/session";

/**
 * Read and like marks, one sorted set per user per kind: the member is the post
 * URL, the score is when it was marked. That score is the whole retention
 * policy — anything older than 30 days is trimmed on every read, and a key left
 * untouched for 30 days expires outright. No cron.
 */

const KINDS = ["read", "liked"] as const;
type Kind = (typeof KINDS)[number];

const TTL_DAYS = 30;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

const key = (sub: string, kind: Kind) => `digest:${sub}:${kind}`;

const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind);
/** Marks are keyed by item URL, and items can now come from any https source. */
const isPostUrl = (u: unknown): u is string =>
  typeof u === "string" && u.length <= 300 && u.startsWith("https://");

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

export async function GET(req: NextRequest) {
  const session = await readSession(req);
  if (!session) return unauthorized();

  const cutoff = Date.now() - TTL_SECONDS * 1000;
  const p = redis().pipeline();
  for (const k of KINDS) {
    p.zremrangebyscore(key(session.sub, k), 0, cutoff);
    p.zrange(key(session.sub, k), 0, -1);
  }
  const [, read, , liked] = (await p.exec()) as [number, string[], number, string[]];

  return NextResponse.json({ email: session.email, read, liked });
}

export async function POST(req: NextRequest) {
  const session = await readSession(req);
  if (!session) return unauthorized();

  const body = (await req.json().catch(() => null)) as {
    kind?: unknown;
    url?: unknown;
    on?: unknown;
  } | null;
  if (!body || !isKind(body.kind) || !isPostUrl(body.url) || typeof body.on !== "boolean") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const k = key(session.sub, body.kind);
  const p = redis().pipeline();
  if (body.on) p.zadd(k, { score: Date.now(), member: body.url });
  else p.zrem(k, body.url);
  p.expire(k, TTL_SECONDS);
  await p.exec();

  return new NextResponse(null, { status: 204 });
}

/** Clears one kind wholesale — the page's "N read · reset". */
export async function DELETE(req: NextRequest) {
  const session = await readSession(req);
  if (!session) return unauthorized();

  const kind = req.nextUrl.searchParams.get("kind");
  if (!isKind(kind)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  await redis().del(key(session.sub, kind));
  return new NextResponse(null, { status: 204 });
}
