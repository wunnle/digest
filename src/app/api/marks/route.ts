import { NextResponse, type NextRequest } from "next/server";
import { KINDS, likedMetaKey, markKey, runsKey, type Kind } from "@/server/marks";
import { lookup, RUN_COUNTS, RUN_ID } from "@/server/payload";
import { redis } from "@/server/redis";
import { readSession } from "@/server/session";

/**
 * Read and like marks, one sorted set per user per kind: the member is the post
 * URL, the score is when it was marked.
 *
 * Read marks are housekeeping and expire: anything older than 30 days is
 * trimmed on every read, and an untouched key expires outright. Likes are
 * kept for good — they feed /insights — along with where each liked post came
 * from, since the payload that named its source is replaced every run.
 */

const READ_TTL_SECONDS = 30 * 24 * 60 * 60;

const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind);
/** Marks are keyed by item URL, and items can now come from any https source. */
const isPostUrl = (u: unknown): u is string =>
  typeof u === "string" && u.length <= 300 && u.startsWith("https://");

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

export async function GET(req: NextRequest) {
  const session = await readSession(req);
  if (!session) return unauthorized();
  const { sub } = session;

  const p = redis().pipeline();
  p.zremrangebyscore(markKey(sub, "read"), 0, Date.now() - READ_TTL_SECONDS * 1000);
  p.zrange(markKey(sub, "read"), 0, -1);
  p.zrange(markKey(sub, "liked"), 0, -1);
  // Clears the TTL earlier versions set on likes, so existing likes are kept too.
  p.persist(markKey(sub, "liked"));
  // Opening the page is what "shown" means: record this run's per-source post
  // counts, once. They're the denominator on /insights.
  p.hsetnx(runsKey(sub), RUN_ID, RUN_COUNTS);
  const [, read, liked] = (await p.exec()) as [number, string[], string[], number, number];

  return NextResponse.json({ email: session.email, read, liked });
}

export async function POST(req: NextRequest) {
  const session = await readSession(req);
  if (!session) return unauthorized();
  const { sub } = session;

  const body = (await req.json().catch(() => null)) as {
    kind?: unknown;
    url?: unknown;
    on?: unknown;
  } | null;
  if (!body || !isKind(body.kind) || !isPostUrl(body.url) || typeof body.on !== "boolean") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { kind, url, on } = body;

  const k = markKey(sub, kind);
  const p = redis().pipeline();
  if (on) p.zadd(k, { score: Date.now(), member: url });
  else p.zrem(k, url);

  if (kind === "read") {
    p.expire(k, READ_TTL_SECONDS);
  } else {
    p.persist(k);
    // Attributed from this deploy's own payload, never from the request.
    const meta = on ? lookup(url) : null;
    if (meta) p.hset(likedMetaKey(sub), { [url]: meta });
    else if (!on) p.hdel(likedMetaKey(sub), url);
  }
  await p.exec();

  return new NextResponse(null, { status: 204 });
}

/** Clears one kind wholesale — the page's read "Reset". */
export async function DELETE(req: NextRequest) {
  const session = await readSession(req);
  if (!session) return unauthorized();

  const kind = req.nextUrl.searchParams.get("kind");
  if (!isKind(kind)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const p = redis().pipeline();
  p.del(markKey(session.sub, kind));
  if (kind === "liked") p.del(likedMetaKey(session.sub));
  await p.exec();
  return new NextResponse(null, { status: 204 });
}
