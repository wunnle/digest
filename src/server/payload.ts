import "server-only";
import { FEEDS, ITEMS, LATEST } from "@/app/data";

/**
 * What the server knows about the posts baked into this deploy — so a like
 * can be attributed to its source without trusting anything the client sends,
 * and a page load can record which posts it put in front of the reader.
 */

export type LikeMeta = {
  sourceId: string;
  type: string;
  label: string;
  publishedAt: string;
};

const feeds = new Map(FEEDS.map((f) => [f.id, f]));

const byUrl = new Map<string, LikeMeta>(
  ITEMS.map((i) => {
    const f = feeds.get(i.sourceId);
    return [
      i.url,
      { sourceId: i.sourceId, type: f?.type ?? "x", label: f?.label ?? i.name, publishedAt: i.publishedAt },
    ];
  }),
);

/** Null when the post isn't in this deploy — older than the 30 days kept. */
export const lookup = (url: string): LikeMeta | null => byUrl.get(url) ?? null;

/**
 * url → source id for the newest run's posts. Recorded per post rather than
 * per run, because runs overlap: the same post can appear in several, and
 * should only count once.
 */
export const SHOWN: Record<string, string> = Object.fromEntries(LATEST.map((l) => [l.url, l.source_id]));

/** Label and type for every source seen, for sources with nothing liked yet. */
export const SOURCE_INFO: Record<string, { label: string; type: string }> = Object.fromEntries(
  FEEDS.map((f) => [f.id, { label: f.label, type: f.type }]),
);
