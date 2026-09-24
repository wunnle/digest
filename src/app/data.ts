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
  handle: string;
  name: string;
  publishedAt: string;
  url: string;
  topic: string;
  /** The post as written, newlines and all. */
  text: string;
  media: Media[];
  /** Present when the post is a quote tweet. Often the substance of the post. */
  quote?: Quote;
};

export type Author = {
  handle: string;
  name: string;
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
  text: string;
  media?: Media[];
  quote_tweet?: RawQuote | null;
};

type Payload = {
  generated_at: string;
  window: { start: string; end: string; timezone: string; duration_hours: number };
  scope: {
    accounts: string[];
    filter: string;
    source: string;
    note?: string;
    fields?: string;
  };
  digest: { handle: string; name: string; items: RawItem[]; note?: string }[];
};

const raw = payload as Payload;

const entries = new Map(raw.digest.map((a) => [a.handle, a]));

/**
 * Ordered by `scope.accounts` — the list the scraper was asked to check — so an
 * account it was given but returned no entry for is still a visible row rather
 * than a silent omission. Any entry not in that list is appended.
 */
const handles = [
  ...raw.scope.accounts.filter((h) => entries.has(h)),
  ...raw.digest.map((a) => a.handle).filter((h) => !raw.scope.accounts.includes(h)),
];

export const AUTHORS: Author[] = handles.map((h) => {
  const a = entries.get(h)!;
  return {
    handle: a.handle,
    name: a.name,
    items: a.items.map((i) => ({
      handle: a.handle,
      name: a.name,
      publishedAt: i.published_at,
      url: i.url,
      topic: i.topic,
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
export const ITEMS: Item[] = AUTHORS.flatMap((a) => a.items).sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt),
);

export const META = {
  generatedAt: raw.generated_at,
  window: raw.window,
  filter: raw.scope.filter,
  accountsScanned: raw.scope.accounts.length,
  accountsWithPosts: AUTHORS.filter((a) => a.items.length > 0).length,
};
