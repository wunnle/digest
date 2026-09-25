/**
 * What the digest scrapes, as one JSON document. The app edits it, the API
 * stores it, and the scraping agent fetches it at the start of every run — see
 * AGENT.md. Shared by server and client, so it holds no secrets and no I/O.
 */

export const SOURCE_TYPES = ["x", "bluesky", "rss", "youtube", "hn", "web"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type Source = {
  /** `${type}:${target}`, lowercased — stable across edits to the label. */
  id: string;
  type: SourceType;
  /** A handle for x/bluesky/youtube, an https URL for rss/web, "front" or a query for hn. */
  target: string;
  /** Display name. Optional — the agent can fill it in from the source itself. */
  label?: string;
  /** Paused sources stay in the list but aren't scraped. */
  enabled: boolean;
  addedAt: string;
};

export type SourcesDoc = {
  version: 1;
  updatedAt: string;
  /** How far back each run looks. */
  windowHours: number;
  sources: Source[];
};

export const LIMITS = { sources: 200, label: 80 } as const;

/** Per-type copy for the form, and how a target is checked. */
export const TYPE_INFO: Record<
  SourceType,
  { label: string; placeholder: string; target: "handle" | "url" | "hn" }
> = {
  x: { label: "X", placeholder: "@handle, or an x.com link", target: "handle" },
  bluesky: { label: "Bluesky", placeholder: "@name.bsky.social, or a bsky.app link", target: "handle" },
  youtube: { label: "YouTube", placeholder: "@channel, or a youtube.com link", target: "handle" },
  rss: { label: "RSS", placeholder: "https://example.com/feed.xml", target: "url" },
  web: { label: "Web", placeholder: "https://example.com/blog", target: "url" },
  hn: { label: "HN", placeholder: "front, or a search query", target: "hn" },
};

export const isSourceType = (t: unknown): t is SourceType =>
  SOURCE_TYPES.includes(t as SourceType);

export const sourceId = (type: SourceType, target: string) =>
  `${type}:${target}`.toLowerCase();

// Covers X (`_sholtodouglas`), Bluesky (`name.bsky.social`, custom domains)
// and YouTube handles, which may use any script (`@日本語チャンネル`) — and
// YouTube's legacy `UC…` channel ids, which fit the same pattern.
const HANDLE = /^[\p{L}\p{N}_][\p{L}\p{N}_.\-\u00B7]{0,99}$/u;

/** Hosts whose profile URLs name a source outright, and how to read them. */
const PROFILE_HOSTS: [RegExp, SourceType, (path: string[]) => string | undefined][] = [
  // x.com/simonw — but not x.com/home, x.com/i/…, x.com/search
  [/^(x|twitter)\.com$/, "x", ([h]) => (h && !["home", "i", "search", "explore"].includes(h) ? h : undefined)],
  // bsky.app/profile/name.bsky.social
  [/^bsky\.app$/, "bluesky", ([p, h]) => (p === "profile" ? h : undefined)],
  // youtube.com/@name, /channel/UC…, /c/name, /user/name
  [
    /^youtube\.com$/,
    "youtube",
    ([a, b]) =>
      a?.startsWith("@") ? a.slice(1) : ["channel", "c", "user"].includes(a ?? "") ? b : undefined,
  ],
  // news.ycombinator.com — the front page
  [/^news\.ycombinator\.com$/, "hn", () => "front"],
];

/**
 * Works out what kind of source a pasted link or handle is, so the form can
 * pick the type itself. Null when it can't tell — a bare `@name` could be on
 * any platform, so that keeps whatever type is selected.
 */
export function detectSource(raw: string): { type: SourceType; target: string } | null {
  const t = raw.trim();
  // A Bluesky handle is recognisable on its own.
  if (/^@?[\w-]+\.bsky\.social$/i.test(t)) return { type: "bluesky", target: t.replace(/^@/, "") };

  // Links, with or without the scheme for the hosts above.
  const withScheme = /^https?:\/\//i.test(t)
    ? t
    : /^(www\.|m\.)?(x|twitter|bsky|youtube|news\.ycombinator)\.(com|app)\//i.test(t)
      ? `https://${t}`
      : null;
  if (!withScheme) return null;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "").toLowerCase();
  const path = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  for (const [re, type, read] of PROFILE_HOSTS) {
    if (!re.test(host)) continue;
    const target = read(path);
    return target ? { type, target } : null;
  }
  if (u.protocol !== "https:") return null;
  // Anything feed-shaped is a feed; any other page is a page.
  const feed = /\.(xml|rss|atom)$|\/(feed|rss|atom)(\/|$)|[?&]format=rss/i.test(u.pathname + u.search);
  return { type: feed ? "rss" : "web", target: u.toString() };
}

/**
 * Tidies a target the way a person would type it and checks it against its
 * type. Returns the cleaned target, or a message fit to show beside the input.
 */
export function cleanTarget(
  type: SourceType,
  raw: string,
): { target: string } | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "Required" };
  switch (TYPE_INFO[type].target) {
    case "handle": {
      // A pasted profile URL for this platform is as good as the handle.
      const found = detectSource(t);
      const h = found?.type === type ? found.target : t.replace(/^@/, "");
      if (HANDLE.test(h)) return { target: h };
      return {
        error: found
          ? `That link is for ${TYPE_INFO[found.type].label} — switch the type`
          : "Not a valid handle",
      };
    }
    case "url": {
      try {
        const u = new URL(t);
        if (u.protocol !== "https:") return { error: "Use an https:// URL" };
        return { target: u.toString() };
      } catch {
        return { error: "Not a valid URL" };
      }
    }
    case "hn":
      return t.length <= 200 ? { target: t } : { error: "Too long" };
  }
}

const optionalString = (v: unknown, max: number) => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new Error("expected a string");
  const s = v.trim();
  if (s.length > max) throw new Error(`longer than ${max} characters`);
  return s || undefined;
};

/**
 * Checks a whole document from an untrusted client and returns a normalised
 * copy — ids recomputed, targets cleaned, duplicates rejected. Throws with a
 * message that says which source is wrong.
 */
export function parseDoc(input: unknown, now = new Date().toISOString()): SourcesDoc {
  if (!input || typeof input !== "object") throw new Error("Expected an object");
  const d = input as Record<string, unknown>;

  const windowHours = Number(d.windowHours);
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 24 * 14) {
    throw new Error("windowHours must be a whole number of hours, 1–336");
  }

  if (!Array.isArray(d.sources)) throw new Error("sources must be a list");
  if (d.sources.length > LIMITS.sources) throw new Error(`At most ${LIMITS.sources} sources`);

  const seen = new Set<string>();
  const sources = d.sources.map((s, i): Source => {
    const where = `Source ${i + 1}`;
    if (!s || typeof s !== "object") throw new Error(`${where}: expected an object`);
    const r = s as Record<string, unknown>;
    if (!isSourceType(r.type)) throw new Error(`${where}: unknown type`);
    const cleaned = cleanTarget(r.type, String(r.target ?? ""));
    if ("error" in cleaned) throw new Error(`${where}: ${cleaned.error}`);
    const id = sourceId(r.type, cleaned.target);
    if (seen.has(id)) throw new Error(`${where}: duplicate of another source`);
    seen.add(id);
    try {
      return {
        id,
        type: r.type,
        target: cleaned.target,
        label: optionalString(r.label, LIMITS.label),
        enabled: r.enabled !== false,
        addedAt: typeof r.addedAt === "string" ? r.addedAt : now,
      };
    } catch (e) {
      throw new Error(`${where}: ${(e as Error).message}`);
    }
  });

  return { version: 1, updatedAt: now, windowHours, sources };
}
