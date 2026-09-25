import { NextResponse, type NextRequest } from "next/server";
import { likedMetaKey, markKey, runsKey } from "@/server/marks";
import { lookup, type LikeMeta, type RunCounts } from "@/server/payload";
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
  const [likedFlat, metaMap, runMap, doc] = await Promise.all([
    r.zrange<(string | number)[]>(markKey(sub, "liked"), 0, -1, { withScores: true }),
    r.hgetall<Record<string, LikeMeta>>(likedMetaKey(sub)),
    r.hgetall<Record<string, RunCounts>>(runsKey(sub)),
    loadSources(),
  ]);

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

  const runs = Object.entries(runMap ?? {});
  for (const [, counts] of runs) {
    for (const [id, c] of Object.entries(counts)) {
      // A source since removed from the list keeps its history.
      const label = TYPE_INFO[c.type as Source["type"]]?.target === "handle" ? `@${c.label}` : c.label;
      row(id, { label, type: c.type }).posts += c.posts;
    }
  }

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
    const x = meta
      ? row(meta.sourceId, {
          label: TYPE_INFO[meta.type as Source["type"]]?.target === "handle" ? `@${meta.label}` : meta.label,
          type: meta.type,
        })
      : row(UNKNOWN, { label: "Unknown source", type: "", inList: true, enabled: true });
    x.likes += 1;
    const iso = new Date(at).toISOString();
    if (!x.lastLikedAt || iso > x.lastLikedAt) x.lastLikedAt = iso;
  }
  if (Object.keys(backfill).length) await r.hset(likedMetaKey(sub), backfill);

  for (const x of rows.values()) {
    // Likes from before run tracking began have no run on record; never show
    // more likes than posts.
    x.posts = Math.max(x.posts, x.likes);
    // Unattributed likes have no posts to be measured against.
    x.rate = x.posts > 0 && x.id !== UNKNOWN ? x.likes / x.posts : null;
  }

  const runStarts = runs.map(([id]) => id);
  const firstLike = likedAt.length ? new Date(Math.min(...likedAt)).toISOString() : null;
  const since = [...runStarts, ...(firstLike ? [firstLike] : [])].sort()[0] ?? null;
  const list = [...rows.values()].filter((x) => x.id !== UNKNOWN || x.likes > 0);

  const body: Insights = {
    rows: list,
    totalLikes: likedAt.length,
    totalPosts: list.reduce((n, x) => n + (x.id === UNKNOWN ? 0 : x.posts), 0),
    runs: runs.length,
    since,
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
