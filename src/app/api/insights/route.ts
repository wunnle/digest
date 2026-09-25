import { NextResponse, type NextRequest } from "next/server";
import { likedMetaKey, markKey, shownKey, shownSinceKey } from "@/server/marks";
import { lookup, SOURCE_INFO, type LikeMeta } from "@/server/payload";
import { redis } from "@/server/redis";
import { readSession } from "@/server/session";
import { loadSources } from "@/server/sources";
import type { InsightRow, Insights } from "@/insights";
import { TYPE_INFO, type Source } from "@/sources";

/**
 * Likes per source, against the posts each source put in front of me — the
 * one question /insights answers: which sources earn their place.
 */

const UNKNOWN = "unknown";

const labelFor = (s: Pick<Source, "type" | "target">) => {
  const kind = TYPE_INFO[s.type]?.target;
  if (kind === "handle") return `@${s.target}`;
  if (kind === "hn") return s.target === "front" ? "HN" : `HN: ${s.target}`;
  try {
    const u = new URL(s.target);
    return u.hostname.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname : "");
  } catch {
    return s.target;
  }
};

export async function GET(req: NextRequest) {
  const session = await readSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sub } = session;

  const r = redis();
  const [likedFlat, metaMap, shownMap, shownSince, doc] = await Promise.all([
    r.zrange<(string | number)[]>(markKey(sub, "liked"), 0, -1, { withScores: true }),
    r.hgetall<Record<string, LikeMeta>>(likedMetaKey(sub)),
    r.hgetall<Record<string, string>>(shownKey(sub)),
    r.get<string>(shownSinceKey(sub)),
    loadSources(),
  ]);

  const handleLabel = (type: string, label: string) =>
    TYPE_INFO[type as Source["type"]]?.target === "handle" ? `@${label}` : label;

  const rows = new Map<string, InsightRow>();
  const row = (id: string, init: Partial<InsightRow> & { label: string; type: string }) => {
    let x = rows.get(id);
    if (!x) {
      x = { id, likes: 0, posts: 0, rate: null, lastLikedAt: null, inList: false, enabled: false, ...init };
      rows.set(id, x);
    }
    return x;
  };

  // Every current source gets a row — no likes and no posts is still an answer.
  for (const s of doc.sources) {
    row(s.id, { label: labelFor(s), name: s.label, type: s.type, inList: true, enabled: s.enabled });
  }

  /** Each source's shown posts, as URLs — a post repeated across runs counts once. */
  const shown = new Map<string, Set<string>>();
  const see = (id: string, url: string) => {
    if (!shown.has(id)) shown.set(id, new Set());
    shown.get(id)!.add(url);
  };
  for (const [url, id] of Object.entries(shownMap ?? {})) see(id, url);

  // Likes made before attribution existed are filled in from this deploy's
  // payload where it still has the post, and remembered for next time.
  const backfill: Record<string, LikeMeta> = {};
  const likedAt: number[] = [];
  for (let i = 0; i < (likedFlat?.length ?? 0); i += 2) {
    const url = String(likedFlat[i]);
    const at = Number(likedFlat[i + 1]);
    likedAt.push(at);
    let meta: LikeMeta | null = metaMap?.[url] ?? null;
    if (!meta) {
      meta = lookup(url);
      if (meta) backfill[url] = meta;
    }
    // A liked post was necessarily shown, even if it predates the record.
    if (meta) see(meta.sourceId, url);
    const x = meta
      ? row(meta.sourceId, { label: handleLabel(meta.type, meta.label), type: meta.type })
      : row(UNKNOWN, { label: "Unknown source", type: "", inList: true, enabled: true });
    x.likes += 1;
    const iso = new Date(at).toISOString();
    if (!x.lastLikedAt || iso > x.lastLikedAt) x.lastLikedAt = iso;
  }
  if (Object.keys(backfill).length) await r.hset(likedMetaKey(sub), backfill);

  for (const [id, urls] of shown) {
    // A source since removed from the list keeps its history.
    const info = SOURCE_INFO[id] ?? { label: id.slice(id.indexOf(":") + 1), type: id.slice(0, id.indexOf(":")) };
    row(id, { label: handleLabel(info.type, info.label), type: info.type }).posts = urls.size;
  }

  for (const x of rows.values()) {
    if (x.id === UNKNOWN) x.posts = x.likes;
    // Unattributed likes have no posts to be measured against.
    x.rate = x.posts > 0 && x.id !== UNKNOWN ? x.likes / x.posts : null;
  }

  const firstLike = likedAt.length ? new Date(Math.min(...likedAt)).toISOString() : null;
  const since = [shownSince, firstLike].filter((d): d is string => !!d).sort()[0] ?? null;
  const list = [...rows.values()].filter((x) => x.id !== UNKNOWN || x.likes > 0);

  const body: Insights = {
    rows: list,
    totalLikes: likedAt.length,
    totalPosts: list.reduce((n, x) => n + (x.id === UNKNOWN ? 0 : x.posts), 0),
    since,
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
