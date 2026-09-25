import "server-only";
import { FEEDS, ITEMS, META, SCANNED } from "@/app/data";

/**
 * What the server knows about the payload baked into this deploy — so a like
 * can be attributed to its source without trusting anything the client sends,
 * and each run's per-source post counts can be recorded once.
 */

export type LikeMeta = {
  sourceId: string;
  type: string;
  label: string;
  publishedAt: string;
};

export type RunCounts = Record<string, { label: string; type: string; posts: number }>;

/** The run's identity: the payload's own timestamp. */
export const RUN_ID = META.generatedAt;

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

/** Null when the post isn't in this deploy's payload — an older run's post. */
export const lookup = (url: string): LikeMeta | null => byUrl.get(url) ?? null;

/**
 * Posts per source in this run, including sources that were scanned and
 * contributed nothing — a zero is exactly what the insights page needs to see.
 */
export const RUN_COUNTS: RunCounts = Object.fromEntries([
  ...SCANNED.filter((id) => !feeds.has(id)).map((id) => [
    id,
    { label: id.slice(id.indexOf(":") + 1), type: id.slice(0, id.indexOf(":")), posts: 0 },
  ]),
  ...FEEDS.map((f) => [f.id, { label: f.label, type: f.type, posts: f.items.length }]),
]);
