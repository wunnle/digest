import { NextResponse, type NextRequest } from "next/server";
import type { Bookmark } from "@/app/data";
import { bookmarksKey, KINDS, likedMetaKey, markKey, shownKey, shownSinceKey, type Kind } from "@/server/marks";
import { lookup, SHOWN, snapshot, type LikeMeta } from "@/server/payload";
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
 *
 * Bookmarks keep the post itself: a snapshot per URL, so the page can merge
 * it back into the feed after the build has dropped it.
 */

const READ_TTL_SECONDS = 30 * 24 * 60 * 60;

const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind);
/** Marks are keyed by item URL, and items can now come from any https source. */
const isPostUrl = (u: unknown): u is string =>
  typeof u === "string" && u.length <= 300 && u.startsWith("https://");

/** Where an archived, bookmarked post came from, for attributing a like to it. */
async function bookmarkMeta(sub: string, url: string): Promise<LikeMeta | null> {
  const b = await redis().hget<Bookmark>(bookmarksKey(sub), url);
  if (!b) return null;
  return { sourceId: b.item.sourceId, type: b.item.type, label: b.label, publishedAt: b.item.publishedAt };
}

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
  // Opening the page is what "shown" means: record the newest run's posts,
  // each once however many runs repeat it. They're the denominator on /insights.
  if (Object.keys(SHOWN).length) p.hset(shownKey(sub), SHOWN);
  p.setnx(shownSinceKey(sub), new Date().toISOString());
  p.hvals(bookmarksKey(sub));
  const res = (await p.exec()) as unknown[];
  const [, read, liked] = res as [number, string[], string[]];
  const bookmarks = (res.at(-1) as Bookmark[] | null) ?? [];

  return NextResponse.json({ email: session.email, read, liked, bookmarks });
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
  if (!body || !isPostUrl(body.url) || typeof body.on !== "boolean") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Bookmarks are snapshots, not marks: they keep the post itself, so it can
  // still be shown once it has left the payload.
  if (body.kind === "bookmarked") {
    const key = bookmarksKey(sub);
    if (!body.on) {
      await redis().hdel(key, body.url);
      return new NextResponse(null, { status: 204 });
    }
    // Already kept: nothing to do (and nothing to snapshot, if it's archived).
    if (await redis().hexists(key, body.url)) return new NextResponse(null, { status: 204 });
    // Built from this deploy's own payload, never from the request.
    const snap = snapshot(body.url);
    if (!snap) return NextResponse.json({ error: "not in this deploy" }, { status: 409 });
    const bookmark: Bookmark = { ...snap, bookmarkedAt: new Date().toISOString() };
    await redis().hset(key, { [body.url]: bookmark });
    return new NextResponse(null, { status: 204 });
  }

  if (!isKind(body.kind)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { kind, url, on } = body;

  const k = markKey(sub, kind);
  const p = redis().pipeline();
  if (on) p.zadd(k, { score: Date.now(), member: url });
  else p.zrem(k, url);

  if (kind === "read") {
    p.expire(k, READ_TTL_SECONDS);
  } else {
    p.persist(k);
    // Attributed from this deploy's own payload, never from the request — or,
    // for an archived post, from the bookmark that keeps it.
    const meta = on ? (lookup(url) ?? (await bookmarkMeta(sub, url))) : null;
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
