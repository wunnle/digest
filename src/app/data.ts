import payload from "../../digest-data.json";

/**
 * Everything on this page comes out of digest-data.json at the repo root — the
 * single file the scraper overwrites. This module reshapes that payload and
 * adds nothing to it: no categories, no labels, no editorial. Every string the
 * page renders is either a payload value or structural chrome (a column
 * heading, a link). Drop in a fresh payload and the page follows.
 */

/** A photo, or a video the payload also gives a poster frame for. */
export type Media = {
  type: "photo" | "video";
  url: string;
  width: number;
  height: number;
  thumbnail_url?: string;
  format?: string;
  duration?: number;
};

/** A post quoted by one of the scanned accounts, by someone not in scope. */
export type Quote = {
  url: string;
  publishedAt: string;
  author: { name: string; handle: string };
  text: string;
  media: Media[];
};

export type Item = {
  /** The source this came from — what the filter chips select on. */
  sourceId: string;
  /** Who wrote it, for the card's byline. */
  name: string;
  publishedAt: string;
  url: string;
  topic: string;
  /** Articles, videos and HN stories have one; posts don't. */
  title?: string;
  /** The post as written, newlines and all. */
  text: string;
  media: Media[];
  /** Present when the post is a quote tweet. Often the substance of the post. */
  quote?: Quote;
};

/** One source's contribution to this run. */
export type Feed = {
  id: string;
  type: string;
  /** What the chip says: the handle for social accounts, else the name. */
  label: string;
  items: Item[];
};

type RawQuote = {
  url: string;
  published_at: string;
  author: { name: string; handle: string };
  text: string;
  media?: Media[];
};

type RawItem = {
  published_at: string;
  url: string;
  topic: string;
  title?: string;
  text: string;
  media?: Media[];
  quote_tweet?: RawQuote | null;
};

/**
 * v1 entries are X accounts keyed by `handle`. v2 adds `source_id` and `type`
 * so an entry can be any source — see AGENT.md. Both shapes are read.
 */
type RawEntry = {
  source_id?: string;
  type?: string;
  handle?: string;
  name: string;
  items: RawItem[];
  note?: string;
};

type Payload = {
  generated_at: string;
  window: { start: string; end: string; timezone: string; duration_hours: number };
  scope: {
    /** v2: the source list the run used. */
    sources?: { id: string }[];
    /** v1: X handles. */
    accounts?: string[];
    filter: string;
    source?: string;
    note?: string;
    fields?: string;
  };
  digest: RawEntry[];
};

const raw = payload as Payload;

const idOf = (e: RawEntry) => (e.source_id ?? `x:${e.handle ?? e.name}`).toLowerCase();

/** The run's own source list, as ids, in the order it was given. */
const scanned: string[] =
  raw.scope.sources?.map((s) => s.id.toLowerCase()) ??
  (raw.scope.accounts ?? []).map((h) => `x:${h}`.toLowerCase());

const entries = new Map(raw.digest.map((e) => [idOf(e), e]));

/**
 * Ordered by the run's source list, so the chips keep the order the list was
 * written in. Any entry not in that list is appended.
 */
const ids = [
  ...scanned.filter((id) => entries.has(id)),
  ...[...entries.keys()].filter((id) => !scanned.includes(id)),
];

export const FEEDS: Feed[] = ids.map((id) => {
  const e = entries.get(id)!;
  return {
    id,
    type: e.type ?? "x",
    label: e.handle ?? e.name,
    items: e.items.map((i) => ({
      sourceId: id,
      name: e.name,
      publishedAt: i.published_at,
      url: i.url,
      topic: i.topic,
      title: i.title || undefined,
      text: i.text,
      media: i.media ?? [],
      quote: i.quote_tweet
        ? {
            url: i.quote_tweet.url,
            publishedAt: i.quote_tweet.published_at,
            author: i.quote_tweet.author,
            text: i.quote_tweet.text,
            media: i.quote_tweet.media ?? [],
          }
        : undefined,
    })),
  };
});

/** Newest first — a digest is read from the top. */
export const ITEMS: Item[] = FEEDS.flatMap((f) => f.items).sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt),
);

export const META = {
  generatedAt: raw.generated_at,
  window: raw.window,
  filter: raw.scope.filter,
  sourcesScanned: scanned.length || entries.size,
  sourcesWithPosts: FEEDS.filter((f) => f.items.length > 0).length,
};
