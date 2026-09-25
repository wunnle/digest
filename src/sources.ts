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
  x: { label: "X", placeholder: "@handle", target: "handle" },
  bluesky: { label: "Bluesky", placeholder: "@name.bsky.social", target: "handle" },
  youtube: { label: "YouTube", placeholder: "@channel", target: "handle" },
  rss: { label: "RSS", placeholder: "https://example.com/feed.xml", target: "url" },
  web: { label: "Web", placeholder: "https://example.com/blog", target: "url" },
  hn: { label: "HN", placeholder: "front, or a search query", target: "hn" },
};

export const isSourceType = (t: unknown): t is SourceType =>
  SOURCE_TYPES.includes(t as SourceType);

export const sourceId = (type: SourceType, target: string) =>
  `${type}:${target}`.toLowerCase();

// Covers X (`_sholtodouglas`), Bluesky (`name.bsky.social`, custom domains)
// and YouTube (`@channel`) handles.
const HANDLE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/;

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
      const h = t.replace(/^@/, "");
      return HANDLE.test(h) ? { target: h } : { error: "Not a valid handle" };
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
