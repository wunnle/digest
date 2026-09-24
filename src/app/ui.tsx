"use client";

/**
 * The per-user marks hook, date formatting for a payload whose timestamps are
 * UTC instants, and the card that renders one post. The card shows payload
 * fields and nothing else.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

/** "22–24 Sep", or "30 Sep – 2 Oct" across a month boundary. */
export const rangeLabel = (startIso: string, endIso: string) => {
  const s = new Date(startIso);
  const e = new Date(endIso);
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${s.getUTCDate()}–${shortDay(endIso)}`
    : `${shortDay(startIso)} – ${shortDay(endIso)}`;
};

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

/** "04:57" — the payload derives these from status IDs, so keep them exact. */
export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

/** 200.133 → "3:20". Videos carry a float duration in seconds. */
const clock = (s: number) => {
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
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
  return (
    <span className="mt-3 block rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <span className="block text-xs text-neutral-500">{quote.author.name}</span>
      <span className="mt-1.5 block whitespace-pre-line break-words text-[15px] leading-relaxed text-neutral-300">
        {linkify(quote.text)}
      </span>
      <MediaBlock media={quote.media} onOpen={onOpen} />
    </span>
  );
}

function ArrowIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 14 14 6M7.5 6H14v6.5" />
    </svg>
  );
}

export function HeartIcon({ filled, className = "h-4 w-4" }: { filled?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 20.5s-7.5-4.6-7.5-9.7a4.3 4.3 0 0 1 7.5-2.8 4.3 4.3 0 0 1 7.5 2.8c0 5.1-7.5 9.7-7.5 9.7Z" />
    </svg>
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
export function Card({
  item,
  read = false,
  liked = false,
  onToggleRead,
  onToggleLike,
  onOpenMedia,
}: {
  item: Item;
  read?: boolean;
  liked?: boolean;
  onToggleRead?: (url: string) => void;
  onToggleLike?: (url: string) => void;
  onOpenMedia?: OpenMedia;
}) {
  const toggle = () => {
    // Selecting text inside a card shouldn't also mark it read — the mouseup
    // that ends a drag still fires a click on the card.
    if (window.getSelection()?.toString()) return;
    onToggleRead?.(item.url);
  };

  return (
    <div
      onClick={onToggleRead ? toggle : undefined}
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
      className={`mb-4 break-inside-avoid rounded-2xl border p-5 transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
        onToggleRead ? "cursor-pointer" : ""
      } ${
        // Liked posts keep a warm tint, which survives the read fade — a post
        // can be both saved and already read.
        liked
          ? "border-rose-400/30 bg-rose-500/[0.08] hover:border-rose-400/50"
          : "border-white/10 bg-white/[0.03] hover:border-white/20"
      } ${
        // Read posts recede but stay legible, and come back on hover so a
        // mis-click isn't a dead end.
        read ? "opacity-35 hover:opacity-100" : ""
      }`}
    >
      {/* Who and when, kept quiet — the post is the point. */}
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="truncate">{item.name}</span>
        <span aria-hidden className="text-neutral-700">·</span>
        {/* Swallows its click: opening the source shouldn't silently flip the
            card's read state behind the new tab. */}
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={swallow}
          title="Open on X"
          className="flex shrink-0 items-center gap-0.5 transition hover:text-neutral-200"
        >
          {shortDay(item.publishedAt)} {timeLabel(item.publishedAt)}
          <ArrowIcon className="h-3 w-3" />
        </a>

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
            className={`-m-1 ml-auto shrink-0 rounded-full p-1 transition ${
              liked ? "text-rose-400" : "text-neutral-600 hover:text-rose-300"
            }`}
          >
            <HeartIcon filled={liked} />
          </button>
        )}
      </div>

      {/* The post as written. `whitespace-pre-line` because many of these
          carry their own line breaks — lists and prompts that collapse into
          mush without them. */}
      <p className="mt-2.5 whitespace-pre-line break-words text-[15px] leading-relaxed text-neutral-100">
        {linkify(item.text)}
      </p>

      <MediaBlock media={item.media} onOpen={onOpenMedia} />

      {item.quote && <QuoteBlock quote={item.quote} onOpen={onOpenMedia} />}
    </div>
  );
}
