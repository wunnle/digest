"use client";

/**
 * The per-user marks hook, date formatting for a payload whose timestamps are
 * UTC instants, and the card that renders one post. The card shows payload
 * fields and nothing else.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Item, Media, Quote } from "./data";

type Kind = "read" | "liked";
type Marks = Record<Kind, ReadonlySet<string>>;
export type AuthStatus = "loading" | "signedOut" | "signedIn";

/**
 * Read marks and likes, kept server-side per signed-in user and keyed by post
 * URL — so a refreshed payload keeps the marks on the posts that survive it and
 * doesn't transfer them to unrelated new ones.
 *
 * Fetched after mount rather than at render: the page itself is static, built
 * from the JSON, and only the marks are per-user. A 401 means signed out, and
 * the page stays readable with marking switched off.
 *
 * Toggles are optimistic — the set flips at once and flips back if the write
 * fails, so a click never waits on the network.
 */
export function useMarks() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [marks, setMarks] = useState<Marks>({ read: new Set(), liked: new Set() });

  // Mirrors `marks` so a click can decide add-vs-remove from what's on screen
  // right now, without reading state inside an updater.
  const current = useRef(marks);
  const commit = useCallback((next: Marks) => {
    current.current = next;
    setMarks(next);
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/marks")
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { email: string; read: string[]; liked: string[] };
        if (!live) return;
        setEmail(data.email);
        commit({ read: new Set(data.read), liked: new Set(data.liked) });
        setStatus("signedIn");
      })
      .catch(() => live && setStatus("signedOut"));
    return () => {
      live = false;
    };
  }, [commit]);

  const flip = useCallback(
    (kind: Kind, url: string) => {
      const next = new Set(current.current[kind]);
      if (!next.delete(url)) next.add(url);
      commit({ ...current.current, [kind]: next });
    },
    [commit],
  );

  const toggle = useCallback(
    (kind: Kind, url: string) => {
      const on = !current.current[kind].has(url);
      flip(kind, url);
      fetch("/api/marks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, url, on }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
        })
        .catch(() => flip(kind, url));
    },
    [flip],
  );

  const toggleRead = useCallback((url: string) => toggle("read", url), [toggle]);
  const toggleLike = useCallback((url: string) => toggle("liked", url), [toggle]);

  const clearRead = useCallback(() => {
    const before = current.current.read;
    commit({ ...current.current, read: new Set() });
    fetch("/api/marks?kind=read", { method: "DELETE" })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
      })
      .catch(() => commit({ ...current.current, read: before }));
  }, [commit]);

  return {
    status,
    email,
    read: marks.read,
    liked: marks.liked,
    toggleRead,
    toggleLike,
    clearRead,
  };
}

/**
 * "23 Sep" from a full instant — the per-card date.
 * en-US for the month: en-GB renders September as "Sept", which reads as a typo
 * next to every other three-letter month.
 */
export const shortDay = (iso: string) => {
  const d = new Date(iso);
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${d.getUTCDate()} ${month}`;
};

const PREF_EVENT = "digest:pref";

/**
 * An on/off viewing preference remembered in this browser — not worth a
 * round trip to the server. False while prerendering, and whenever storage is
 * blocked, so the page always renders.
 */
export function usePreference(key: string): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (tick) => {
      // `storage` covers other tabs; the custom event covers this one.
      window.addEventListener("storage", tick);
      window.addEventListener(PREF_EVENT, tick);
      return () => {
        window.removeEventListener("storage", tick);
        window.removeEventListener(PREF_EVENT, tick);
      };
    },
    () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        if (next) localStorage.setItem(key, "1");
        else localStorage.removeItem(key);
      } catch {
        // Private mode or a full quota: the toggle just won't be remembered.
      }
      window.dispatchEvent(new Event(PREF_EVENT));
    },
    [key],
  );
  return [on, set];
}

/** When this build was made — which, with a build per deploy, is the last deploy. */
export const BUILT_AT = process.env.BUILT_AT ?? "";

/** One interval shared by every subscriber — every card's date reads it. */
const minuteListeners = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | undefined;
const subscribeMinute = (tick: () => void) => {
  minuteListeners.add(tick);
  minuteTimer ??= setInterval(() => minuteListeners.forEach((l) => l()), 60_000);
  return () => {
    minuteListeners.delete(tick);
    if (minuteListeners.size === 0) {
      clearInterval(minuteTimer);
      minuteTimer = undefined;
    }
  };
};

/**
 * The current minute, or null while prerendering and hydrating — the server
 * can't know when the page will be read, so anything relative waits for the
 * client instead of mismatching.
 */
export function useMinute(): number | null {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
}

/** "just now", "12m ago", "3h ago", "2d ago". */
export const ago = (iso: string, minute: number) => {
  const m = Math.max(0, minute - Math.floor(new Date(iso).getTime() / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / (60 * 24))}d ago`;
};

/** "04:57" — the payload derives these from status IDs, so keep them exact. */
export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * "Today", "Yesterday", a weekday within the week, else "23 Sep" — in the
 * reader's own timezone. Until the client knows the time (prerender and
 * hydration) it's the plain UTC date, so the two renders agree.
 */
export const dayLabel = (iso: string, minute: number | null) => {
  if (minute === null) return shortDay(iso);
  const d = new Date(iso);
  const days = Math.round((startOfLocalDay(new Date(minute * 60_000)) - startOfLocalDay(d)) / 864e5);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${d.getDate()} ${month}`;
};

/** "09:41" in the reader's timezone. */
const localTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * A post's date, linking to the post. The time is secondary, so it only
 * shows on hover. Swallows its click: opening the source shouldn't silently
 * flip the card's read state behind the new tab.
 */
function DateLink({ url, iso }: { url: string; iso: string }) {
  const minute = useMinute();
  // A quoted post may come without a timestamp; the link still works.
  const valid = !Number.isNaN(Date.parse(iso));
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={swallow}
      title={`${valid ? `${new Date(iso).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })} — ` : ""}open on ${host(url)}`}
      className="group/date flex shrink-0 items-center gap-1 transition hover:text-neutral-200"
    >
      {valid ? dayLabel(iso, minute) : "Open"}
      {valid && minute !== null && (
        <span className="hidden text-neutral-500 group-hover/date:inline">{localTime(iso)}</span>
      )}
      <ArrowIcon />
    </a>
  );
}

/** 200.133 → "3:20". Videos carry a float duration in seconds. */
const clock = (s: number) => {
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** "x.com" → "X", "www.simonwillison.net" → "simonwillison.net". */
const host = (url: string) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h === "x.com" || h === "twitter.com" ? "X" : h;
  } catch {
    return "source";
  }
};

/** Stop a click inside the card from also toggling the card's read state. */
const swallow = (e: React.MouseEvent) => e.stopPropagation();

const URL_RE = /(https?:\/\/[^\s]+)/g;

/**
 * Post text with its URLs made clickable. The posts are full of links they'd
 * otherwise only be readable as text — blog posts, repos, playgrounds. Trailing
 * punctuation is pushed back into the text, so a URL ending a sentence doesn't
 * swallow the full stop into the href.
 */
export function linkify(text: string) {
  return text.split(URL_RE).map((chunk, i) => {
    if (i % 2 === 0) return chunk;
    const trailing = chunk.match(/[.,;:!?)\]]+$/)?.[0] ?? "";
    const href = trailing ? chunk.slice(0, -trailing.length) : chunk;
    return (
      <span key={i}>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={swallow}
          className="text-sky-300 underline decoration-sky-300/40 underline-offset-2 transition hover:decoration-sky-300"
        >
          {href}
        </a>
        {trailing}
      </span>
    );
  });
}

function PlayIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

/**
 * Photos hotlink `pbs.twimg.com` and videos show their poster frame rather than
 * an embedded player — the card already links to the post, which is where a
 * video can actually be played. Plain `img`: the payload's hosts aren't in
 * next.config's remote patterns, and every URL arrives pre-sized anyway.
 */
function Shot({
  m,
  className = "",
  style,
  onOpen,
}: {
  m: Media;
  className?: string;
  style?: React.CSSProperties;
  onOpen?: () => void;
}) {
  const src = m.type === "video" ? m.thumbnail_url : m.url;
  if (!src) return null;
  return (
    <span
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={
        onOpen
          ? (e) => {
              e.stopPropagation();
              onOpen();
            }
          : undefined
      }
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              onOpen();
            }
          : undefined
      }
      className={`relative block overflow-hidden rounded-xl bg-white/5 ${
        onOpen ? "cursor-zoom-in transition hover:brightness-110" : ""
      } ${className}`}
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        width={m.width}
        height={m.height}
        className="h-full w-full object-cover"
      />
      {m.type === "video" && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="flex items-center gap-1.5 rounded-full bg-black/70 py-1.5 pl-2.5 pr-3 text-xs font-medium text-white">
            <PlayIcon className="h-3.5 w-3.5" />
            {m.duration ? clock(m.duration) : "Video"}
          </span>
        </span>
      )}
    </span>
  );
}

/** What the card hands up to the page when a thumbnail is clicked. */
export type OpenMedia = (media: Media[], index: number) => void;

/** One photo runs full width at its own ratio; several tile two-up. */
function MediaBlock({ media, onOpen }: { media: Media[]; onOpen?: OpenMedia }) {
  if (media.length === 0) return null;
  if (media.length === 1) {
    const m = media[0];
    // Reserving the ratio up front stops the column reflowing as photos load.
    // Tall portraits are capped so one screenshot can't own the whole column.
    return (
      <Shot
        m={m}
        className="mt-3 max-h-[30rem] w-full"
        style={{ aspectRatio: `${m.width} / ${m.height}` }}
        onOpen={onOpen && (() => onOpen(media, 0))}
      />
    );
  }
  return (
    <span className="mt-3 grid grid-cols-2 gap-2">
      {media.map((m, i) => (
        <Shot key={m.url} m={m} className="aspect-[4/3]" onOpen={onOpen && (() => onOpen(media, i))} />
      ))}
    </span>
  );
}

function CloseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function ChevronIcon({ dir, className = "h-6 w-6" }: { dir: -1 | 1; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={dir === 1 ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} />
    </svg>
  );
}

/**
 * Full-size view of one post's media. Photos load at `?name=orig`, so the
 * lightbox is the only place their detail is legible — several are screenshots
 * of text. Videos get a real player here, since the thumbnail can't be played.
 */
export function Lightbox({
  media,
  index,
  onIndex,
  onClose,
}: {
  media: Media[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const step = useCallback(
    (d: -1 | 1) => onIndex((index + d + media.length) % media.length),
    [index, media.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    // The page behind shouldn't scroll while the overlay is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, step]);

  const m = media[index];
  if (!m) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm sm:p-8"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full p-2 text-neutral-300 ring-1 ring-white/20 transition hover:bg-white/10 hover:text-white"
      >
        <CloseIcon />
      </button>

      {media.length > 1 &&
        ([-1, 1] as const).map((dir) => (
          <button
            key={dir}
            onClick={(e) => {
              e.stopPropagation();
              step(dir);
            }}
            aria-label={dir === 1 ? "Next" : "Previous"}
            className={`absolute top-1/2 -translate-y-1/2 rounded-full p-3 text-neutral-300 ring-1 ring-white/20 transition hover:bg-white/10 hover:text-white ${
              dir === 1 ? "right-4" : "left-4"
            }`}
          >
            <ChevronIcon dir={dir} />
          </button>
        ))}

      {/* Stop clicks on the media itself from closing the overlay. */}
      <div onClick={swallow} className="flex max-h-full max-w-full flex-col items-center gap-3">
        {m.type === "video" ? (
          <video
            src={m.url}
            poster={m.thumbnail_url}
            controls
            autoPlay
            className="max-h-[85vh] max-w-full rounded-lg"
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={m.url} alt="" className="max-h-[85vh] max-w-full rounded-lg object-contain" />
        )}
        {media.length > 1 && (
          <p className="font-mono text-xs text-neutral-400">
            {index + 1} / {media.length}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The post this one quotes. Six of the twenty-two are quote tweets, and in
 * several the quoted post is the substance — "my kind of slop" means nothing
 * without the thing being called slop.
 */
function QuoteBlock({ quote, onOpen }: { quote: Quote; onOpen?: OpenMedia }) {
  // The whole block opens the quoted post — except where something inside it
  // (a link, an image) handles the click itself, or text is being selected.
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest("a, button, [role=button]")) return;
    if (window.getSelection()?.toString()) return;
    if (quote.url) window.open(quote.url, "_blank", "noreferrer");
  };
  return (
    <span
      onClick={open}
      title={quote.url ? "Open the quoted post" : undefined}
      className={`mt-3 block rounded-xl border border-white/10 bg-white/[0.03] p-4 transition ${
        quote.url ? "cursor-pointer hover:border-white/25 hover:bg-white/[0.06]" : ""
      }`}
    >
      <span className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="truncate">{quote.author.name}</span>
        {quote.url && (
          <>
            <span aria-hidden className="text-neutral-700">·</span>
            <DateLink url={quote.url} iso={quote.publishedAt} />
          </>
        )}
      </span>
      <span className="mt-1.5 block whitespace-pre-line break-words text-[15px] leading-relaxed text-neutral-300">
        {linkify(quote.text)}
      </span>
      <MediaBlock media={quote.media} onOpen={onOpen} />
    </span>
  );
}



/**
 * One post: who posted it and when, quietly, then the post itself and its
 * media. The post text is the only bright thing on the card.
 *
 * A `div`, not an `<a>`: clicking the card toggles read, and it contains links
 * and buttons of its own, which an anchor can't. The timestamp is the link to
 * the post instead.
 */
/**
 * One icon set: a 24-unit grid, one stroke weight, round caps — so the heart,
 * expand and link icons sit at the same size and weight side by side.
 */
export function Icon({ className = "h-4 w-4", filled, children }: { className?: string; filled?: boolean; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function HeartIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <Icon filled={filled} className={className}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </Icon>
  );
}

export function EyeIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M10.73 5.08A10.74 10.74 0 0 1 21.94 11.65a1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49" />
      <path d="M14.08 14.16a3 3 0 0 1-4.24-4.24" />
      <path d="M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14" />
      <path d="m2 2 20 20" />
    </Icon>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </Icon>
  );
}

/**
 * Which platform a post or source is from — small and muted, so it reads as a
 * cue rather than a badge. Brand marks are filled; the generic ones (RSS, web,
 * HN) are drawn in the same stroke as the rest of the icon set.
 */
export function PlatformIcon({ type, className = "h-3.5 w-3.5" }: { type: string; className?: string }) {
  const label = { x: "X", youtube: "YouTube", bluesky: "Bluesky", rss: "RSS", hn: "Hacker News", web: "Web" }[type] ?? type;
  const filled = (d: string) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${className}`} role="img" aria-label={label}>
      <path fillRule="evenodd" d={d} />
    </svg>
  );
  switch (type) {
    case "x":
      return filled(
        "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12Z",
      );
    case "youtube":
      return filled(
        "M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6Z",
      );
    case "bluesky":
      return filled(
        "M12 10.8C10.91 8.69 7.95 4.75 5.2 2.8 2.57.94 1.56 1.27.9 1.57.14 1.9 0 3.08 0 3.77c0 .69.38 5.65.62 6.48.82 2.74 3.72 3.66 6.39 3.36-3.92.58-7.4 2-2.83 7.08 5.01 5.19 6.87-1.11 7.82-4.3.95 3.19 2.05 9.27 7.73 4.3 4.27-4.3 1.17-6.5-2.74-7.08 2.67.3 5.57-.62 6.39-3.36.24-.83.62-5.79.62-6.48 0-.69-.14-1.86-.9-2.2-.66-.3-1.67-.63-4.3 1.23C16.05 4.75 13.09 8.69 12 10.8Z",
      );
    case "rss":
      return (
        <Icon className={className}>
          <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
          <circle cx="5" cy="19" r="1" />
        </Icon>
      );
    case "hn":
      return (
        <Icon className={className}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="m8 7 4 6 4-6M12 13v4" />
        </Icon>
      );
    default:
      return (
        <Icon className={className}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
        </Icon>
      );
  }
}

function ArrowIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M7 17 17 7M7 7h10v10" />
    </Icon>
  );
}

/** The video id from any YouTube link: watch, youtu.be, shorts, live, embed. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, "");
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1)
        : host === "youtube.com" || host === "youtube-nocookie.com"
          ? u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/)?.[1]
          : null;
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * A YouTube video as its thumbnail, opening the video on YouTube in a new tab.
 * The thumbnail comes from the video id, so the agent needn't supply one.
 * Swallows its click so opening a video doesn't also mark the card read.
 */
function YouTubePreview({ id, url, title }: { id: string; url: string; title?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={swallow}
      aria-label={`Watch ${title ?? "video"} on YouTube`}
      className="group/yt relative mt-3 block aspect-video w-full overflow-hidden rounded-xl bg-white/5"
    >
      {/* hqdefault always exists; it's 4:3 with bars, which the 16:9 crop removes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition group-hover/yt:brightness-110"
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/20">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/20 transition group-hover/yt:scale-105 group-hover/yt:bg-black/80">
          <PlayIcon className="h-5 w-5 translate-x-px" />
        </span>
      </span>
    </a>
  );
}

/** Title, text, media and quote — the post itself, shared by the card and focus view. */
function PostBody({
  item,
  onOpenMedia,
  large = false,
}: {
  item: Item;
  onOpenMedia?: OpenMedia;
  large?: boolean;
}) {
  const size = large ? "text-[17px]" : "text-[15px]";
  return (
    <>
      {/* Articles, videos and stories lead with their headline; the text
          under it is then a summary, so it steps back a shade. */}
      {item.title && (
        <p className={`mt-2.5 ${large ? "text-xl" : "text-[15px]"} font-medium leading-snug text-white`}>
          {item.title}
        </p>
      )}

      {/* The post as written. `whitespace-pre-line` because many of these
          carry their own line breaks — lists and prompts that collapse into
          mush without them. */}
      {/* A video's title is enough; its description is YouTube's clutter. */}
      {item.text && item.type !== "youtube" && (
        <p
          className={`whitespace-pre-line break-words ${size} leading-relaxed ${
            item.title ? "mt-1.5 text-neutral-300" : "mt-2.5 text-neutral-100"
          }`}
        >
          {linkify(item.text)}
        </p>
      )}

      {/* YouTube previews from its own URL; anything else shows the payload's media. */}
      {item.type === "youtube" && youtubeId(item.url) ? (
        <YouTubePreview id={youtubeId(item.url)!} url={item.url} title={item.title} />
      ) : (
        <MediaBlock media={item.media} onOpen={onOpenMedia} />
      )}

      {item.quote && <QuoteBlock quote={item.quote} onOpen={onOpenMedia} />}
    </>
  );
}


/** Who and when, kept quiet — the post is the point. */
function Byline({ item }: { item: Item }) {
  return (
    <>
      <PlatformIcon type={item.type} className="h-3.5 w-3.5 text-neutral-500" />
      <span className="truncate">{item.name}</span>
      <span aria-hidden className="text-neutral-700">·</span>
      <DateLink url={item.url} iso={item.publishedAt} />
    </>
  );
}

export function Card({
  item,
  read = false,
  liked = false,
  onToggleRead,
  onToggleLike,
  onOpenMedia,
  onExpand,
}: {
  item: Item;
  read?: boolean;
  liked?: boolean;
  onToggleRead?: (url: string) => void;
  onToggleLike?: (url: string) => void;
  onOpenMedia?: OpenMedia;
  onExpand?: (url: string) => void;
}) {
  /**
   * Read cards come back to full strength on hover, so a mis-click isn't a
   * dead end — but not while the cursor is still on the card that was just
   * marked, or marking would look like it did nothing.
   */
  const [justMarked, setJustMarked] = useState(false);

  const toggle = () => {
    // Selecting text inside a card shouldn't also mark it read — the mouseup
    // that ends a drag still fires a click on the card.
    if (window.getSelection()?.toString()) return;
    if (!read) setJustMarked(true);
    onToggleRead?.(item.url);
  };

  const fade = liked ? "opacity-60" : "opacity-35";

  return (
    <div
      onClick={onToggleRead ? toggle : undefined}
      onMouseLeave={() => setJustMarked(false)}
      onKeyDown={
        onToggleRead
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              toggle();
            }
          : undefined
      }
      role={onToggleRead ? "button" : undefined}
      tabIndex={onToggleRead ? 0 : undefined}
      aria-pressed={onToggleRead ? read : undefined}
      className={`card group mb-4 break-inside-avoid rounded-2xl border p-5 transition-[opacity,border-color,background-color,filter,box-shadow,translate] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
        onToggleRead ? "cursor-pointer" : ""
      } ${
        // Liked posts carry the rose in their fill and border, so they're
        // findable at a glance down a column of cards.
        liked
          ? "border-rose-400/45 bg-rose-500/[0.13] hover:-translate-y-0.5 hover:border-rose-400/90 hover:shadow-[0_22px_50px_-22px_rgba(244,63,94,0.55),0_10px_24px_-12px_rgba(0,0,0,0.8)]"
          : "border-white/10 bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/35 hover:shadow-[0_22px_50px_-20px_rgba(0,0,0,0.95),0_0_40px_-12px_rgba(96,165,250,0.18)]"
      } ${
        // A liked post fades less when read — it was kept on purpose.
        read ? (justMarked ? fade : `${fade} hover:opacity-100`) : ""
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Byline item={item} />

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {/* Desktop only, and only on hover, so it doesn't add noise to
              every card. Swallows its click like the other controls. */}
          {onExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand(item.url);
              }}
              aria-label="Expand"
              title="Expand"
              className="-m-1 hidden rounded-full p-1 text-neutral-500 opacity-0 transition hover:text-white focus-visible:opacity-100 group-hover:opacity-100 md:block"
            >
              <ExpandIcon />
            </button>
          )}

          {/* Swallows its click — liking a post says nothing about whether
              you've finished reading it. */}
          {onToggleLike && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLike(item.url);
              }}
              aria-pressed={liked}
              aria-label={liked ? "Remove like" : "Like"}
              className={`-m-1 rounded-full p-1 transition ${
                liked ? "text-rose-400" : "text-neutral-600 hover:text-rose-300"
              }`}
            >
              <HeartIcon filled={liked} />
            </button>
          )}
        </span>
      </div>

      <PostBody item={item} onOpenMedia={onOpenMedia} />
    </div>
  );
}

/**
 * One post, large and alone — for reading something long, or a post whose
 * screenshots need the room. ←/→ move through the posts on the page; Esc
 * closes. Keys pause while the media lightbox is open over it.
 */
export function Focus({
  item,
  position,
  read,
  liked,
  paused,
  onToggleRead,
  onToggleLike,
  onOpenMedia,
  onStep,
  onClose,
}: {
  item: Item;
  /** "3 / 22" — where this post sits in the current view. */
  position: string;
  read: boolean;
  liked: boolean;
  paused: boolean;
  onToggleRead?: (url: string) => void;
  onToggleLike?: (url: string) => void;
  onOpenMedia?: OpenMedia;
  onStep: (dir: -1 | 1) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, onClose, onStep]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Each post opens at its top.
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [item.url]);

  const pill = "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Post by ${item.name}`}
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
    >
      {([-1, 1] as const).map((dir) => (
        <button
          key={dir}
          onClick={(e) => {
            e.stopPropagation();
            onStep(dir);
          }}
          aria-label={dir === 1 ? "Next post" : "Previous post"}
          className={`absolute top-1/2 hidden -translate-y-1/2 rounded-full p-3 text-neutral-400 ring-1 ring-white/15 transition hover:bg-white/10 hover:text-white md:block ${
            dir === 1 ? "right-6" : "left-6"
          }`}
        >
          <ChevronIcon dir={dir} />
        </button>
      ))}

      <div
        ref={panel}
        onClick={swallow}
        className={`relative max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border p-7 shadow-2xl ${
          liked ? "border-rose-400/45 bg-[#1d1114]" : "border-white/10 bg-neutral-900"
        }`}
      >
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Byline item={item} />
          <span className="ml-auto flex shrink-0 items-center gap-3">
            <span className="font-mono tabular-nums text-neutral-600">{position}</span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="-m-1 rounded-full p-1 text-neutral-400 transition hover:bg-white/10 hover:text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </span>
        </div>

        <PostBody item={item} onOpenMedia={onOpenMedia} large />

        {(onToggleLike || onToggleRead) && (
          <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-5">
            {onToggleLike && (
              <button
                onClick={() => onToggleLike(item.url)}
                aria-pressed={liked}
                className={`${pill} ${
                  liked
                    ? "bg-rose-500/20 text-rose-200 ring-rose-400/40"
                    : "text-neutral-400 ring-white/10 hover:text-rose-300 hover:ring-rose-400/30"
                }`}
              >
                <HeartIcon filled={liked} className="h-3.5 w-3.5" />
                {liked ? "Liked" : "Like"}
              </button>
            )}
            {onToggleRead && (
              <button
                onClick={() => onToggleRead(item.url)}
                aria-pressed={read}
                className={`${pill} ${
                  read
                    ? "bg-white/10 text-white ring-white/20"
                    : "text-neutral-400 ring-white/10 hover:text-white hover:ring-white/30"
                }`}
              >
                {read ? "Read" : "Mark read"}
              </button>
            )}
            <span className="ml-auto hidden text-xs text-neutral-600 md:inline">← → to move · Esc to close</span>
          </div>
        )}
      </div>
    </div>
  );
}
