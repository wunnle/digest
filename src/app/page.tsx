"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GearIcon, InsightsIcon, Shell, SidebarLink } from "./shell";
import { FEEDS, ITEMS, META, type Item, type Media } from "./data";
import {
  ago,
  BUILT_AT,
  Card,
  EyeIcon,
  EyeOffIcon,
  Focus,
  BookmarkIcon,
  HeartIcon,
  PlatformIcon,
  Lightbox,
  shortDay,
  timeLabel,
  useMarks,
  useMinute,
  usePreference,
} from "./ui";

const stampUtc = (iso: string) => `${shortDay(iso)} ${timeLabel(iso)} UTC`;

const IN_PAYLOAD = new Set(ITEMS.map((i) => i.url));
const FEED_INFO = new Map(FEEDS.map((f) => [f.id, { label: f.label, type: f.type }]));

type Chip = { id: string; label: string; type: string; count: number };

export default function DigestPage() {
  /** Selected source ids. Empty means everything, so the page opens complete. */
  const [active, setActive] = useState<string[]>([]);

  const { status, email, read, liked, bookmarks, toggleRead, toggleLike, toggleBookmark, clearRead } =
    useMarks();

  /**
   * The feed is this deploy's posts plus any bookmarked post that has since
   * left it — merged here rather than at build time, so bookmarking and
   * un-bookmarking show at once. A post still in the payload keeps its fresh
   * copy.
   */
  const items = useMemo<Item[]>(() => {
    const kept = [...bookmarks.values()].filter((b) => !IN_PAYLOAD.has(b.item.url)).map((b) => b.item);
    if (kept.length === 0) return ITEMS;
    return [...ITEMS, ...kept].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }, [bookmarks]);

  /** One chip per source with posts — including sources only bookmarks still hold. */
  const chips = useMemo<Chip[]>(() => {
    const byId = new Map<string, Chip>();
    for (const i of items) {
      const c = byId.get(i.sourceId);
      if (c) c.count += 1;
      else {
        const info = FEED_INFO.get(i.sourceId) ?? {
          label: bookmarks.get(i.url)?.label ?? i.name,
          type: i.type,
        };
        byId.set(i.sourceId, { id: i.sourceId, ...info, count: 1 });
      }
    }
    // Keep the payload's own source order; bookmark-only sources follow.
    const order = new Map(FEEDS.map((f, n) => [f.id, n]));
    return [...byId.values()].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  }, [items, bookmarks]);
  const minute = useMinute();

  /**
   * Marking needs a signed-in user. Signed out, the handlers are withheld and
   * the card renders as plain reading — no click target, no heart.
   */
  const canMark = status === "signedIn";
  const onToggleLike = canMark ? toggleLike : undefined;
  const onToggleBookmark = canMark ? toggleBookmark : undefined;

  /** Hide posts already read. Remembered per browser. */
  const [hideRead, setHideRead] = usePreference("digest:hideRead");
  /**
   * Posts marked read while hiding is on stay on screen, faded, until the next
   * toggle or reload — a card vanishing from under the cursor reads as a
   * misclick, and would leave no way to undo it.
   */
  const [keep, setKeep] = useState<ReadonlySet<string>>(new Set());
  const markRead = useCallback(
    (url: string) => {
      if (hideRead) setKeep((k) => new Set(k).add(url));
      toggleRead(url);
    },
    [hideRead, toggleRead],
  );
  const onToggleRead = canMark ? markRead : undefined;
  /** Says what the feed is doing, so the toggle needs no "on" look of its own. */
  const readToggleLabel = hideRead ? "Hiding read" : "Showing read";
  const readToggleIcon = (className?: string) =>
    hideRead ? <EyeOffIcon className={className} /> : <EyeIcon className={className} />;
  const flipHideRead = () => {
    setHideRead(!hideRead);
    setKeep(new Set());
  };

  /** Set by the OAuth callback when it turns a sign-in away. Read after mount
      so the static page doesn't depend on the query. */
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    const fromQuery = () => {
      const params = new URLSearchParams(window.location.search);
      const reason = params.get("auth");
      if (!reason) return;
      setAuthError(
        reason === "denied"
          ? "That Google account isn't allowed here."
          : "Sign-in failed. Try again.",
      );
      // Drop it from the URL so a reload doesn't repeat the message.
      params.delete("auth");
      const q = params.toString();
      const { pathname, hash } = window.location;
      history.replaceState(null, "", `${pathname}${q ? `?${q}` : ""}${hash}`);
    };
    fromQuery();
  }, []);

  /** Narrow the page to saved posts. Off unless there's something to show. */
  const [likedOnly, setLikedOnly] = useState(false);
  /** Narrow the page to bookmarked posts. */
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  /** Which media set the lightbox is showing, and where in it. */
  const [zoom, setZoom] = useState<{ media: Media[]; index: number } | null>(null);
  const openMedia = useCallback((media: Media[], index: number) => setZoom({ media, index }), []);

  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (active.length === 0 || active.includes(i.sourceId)) &&
          (!likedOnly || liked.has(i.url)) &&
          (!bookmarkedOnly || bookmarks.has(i.url)) &&
          (!hideRead || !read.has(i.url) || keep.has(i.url)),
      ),
    [items, active, likedOnly, liked, bookmarkedOnly, bookmarks, hideRead, read, keep],
  );

  /** The post open in the focus view, by URL, and where it sits in the view. */
  const [focusUrl, setFocusUrl] = useState<string | null>(null);
  const focusIndex = focusUrl ? shown.findIndex((i) => i.url === focusUrl) : -1;
  // Looked up in everything, not just what's shown, so unliking a post under
  // "Liked only" doesn't yank it out from under the reader.
  const focusItem = focusUrl ? items.find((i) => i.url === focusUrl) : undefined;
  const stepFocus = useCallback(
    (dir: -1 | 1) => {
      if (shown.length === 0) return;
      const from = focusIndex === -1 ? (dir === 1 ? -1 : 0) : focusIndex;
      setFocusUrl(shown[(from + dir + shown.length) % shown.length].url);
    },
    [shown, focusIndex],
  );
  const closeFocus = useCallback(() => setFocusUrl(null), []);

  /** Counted over the whole payload, not the filtered view, so the numbers
      don't appear to drop when a filter hides posts. */
  const readCount = useMemo(() => items.filter((i) => read.has(i.url)).length, [items, read]);
  const likedCount = useMemo(() => items.filter((i) => liked.has(i.url)).length, [items, liked]);
  const bookmarkedCount = bookmarks.size;

  const toggleSource = (id: string) =>
    setActive((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** A sidebar filter: full width, label left, count right. */
  const row = (on: boolean) =>
    `flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left transition ${
      on ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
    }`;

  const chip = (on: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition ${
      on ? "bg-white/10 text-white" : "text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
    }`;

  const subtitle = (
    <span title={`Collected ${stampUtc(META.generatedAt)} · deployed ${stampUtc(BUILT_AT)}`}>
      {items.length} posts
      {/* Relative once the client knows the time; the exact stamp until then. */}
      {BUILT_AT && <> · updated {minute === null ? stampUtc(BUILT_AT) : ago(BUILT_AT, minute)}</>}
    </span>
  );

  /** Everything above the posts: sign-in errors, filter row, hint. */
  const top = (
    <>
      {authError && <p className="mt-3 text-sm text-rose-300/80">{authError}</p>}

      {/* One row. It scrolls sideways on a phone rather than wrapping into a
          block that pushes the posts down. */}
      <div
        className={`-mx-4 mt-5 flex items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 ${
          "xl:hidden"
        }`}
      >
        {/* Only appears once there's something saved — an always-on filter
            that can only ever show nothing is just a dead control. */}
        {likedCount > 0 && (
          <>
            <button
              onClick={() => setLikedOnly((v) => !v)}
              aria-pressed={likedOnly}
              aria-label="Liked only"
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition ${
                likedOnly
                  ? "bg-rose-500/15 text-rose-300"
                  : "text-neutral-500 hover:bg-white/5 hover:text-rose-300"
              }`}
            >
              <HeartIcon filled={likedOnly} className="h-3.5 w-3.5" />
              <span className="tabular-nums text-neutral-600">{likedCount}</span>
            </button>
          </>
        )}
        {bookmarkedCount > 0 && (
          <button
            onClick={() => setBookmarkedOnly((v) => !v)}
            aria-pressed={bookmarkedOnly}
            aria-label="Bookmarked only"
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition ${
              bookmarkedOnly
                ? "bg-amber-400/15 text-amber-200"
                : "text-neutral-500 hover:bg-white/5 hover:text-amber-200"
            }`}
          >
            <BookmarkIcon filled={bookmarkedOnly} className="h-3.5 w-3.5" />
            <span className="tabular-nums text-neutral-600">{bookmarkedCount}</span>
          </button>
        )}
        {(likedCount > 0 || bookmarkedCount > 0) && (
          <span className="mx-1 h-3.5 w-px shrink-0 bg-white/10" aria-hidden />
        )}

        {chips.map((f) => (
          <button
            key={f.id}
            onClick={() => toggleSource(f.id)}
            aria-pressed={active.includes(f.id)}
            className={chip(active.includes(f.id))}
          >
            <PlatformIcon type={f.type} className="h-3 w-3 opacity-70" />
            {f.label}
            <span className="tabular-nums text-neutral-600">{f.count}</span>
          </button>
        ))}

        {active.length > 0 && (
          <button
            onClick={() => setActive([])}
            className="shrink-0 px-2 py-1 text-xs text-neutral-600 transition hover:text-neutral-300"
          >
            Clear
          </button>
        )}

        {/* Only once something's been read — before that, there's nothing to hide. */}
        {canMark && readCount > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button onClick={flipHideRead} aria-pressed={hideRead} className={chip(false)}>
              {readToggleIcon("h-3.5 w-3.5")}
              {readToggleLabel}
              <span className="tabular-nums text-neutral-600">{readCount}</span>
            </button>
            {/* Without this, marking everything read leaves a page of faded
                cards and no way back. */}
            <button
              onClick={clearRead}
              className="shrink-0 px-2 py-1 text-xs text-neutral-600 transition hover:text-neutral-300"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Click-to-read isn't discoverable on its own. Once something's been
          marked, the hint has done its job. */}
      {canMark && readCount === 0 && likedCount === 0 && (
        <p className="mt-3 text-xs text-neutral-600 xl:hidden">
          Click a card to mark it read.
        </p>
      )}
    </>
  );

  const posts = (
    <>
      {shown.map((i) => (
        <Card
          key={i.url}
          item={i}
          read={read.has(i.url)}
          liked={liked.has(i.url)}
          bookmarked={bookmarks.has(i.url)}
          onToggleRead={onToggleRead}
          onToggleLike={onToggleLike}
          onToggleBookmark={onToggleBookmark}
          onOpenMedia={openMedia}
          onExpand={setFocusUrl}
        />
      ))}
    </>
  );

  const emptyState = (
    <>
      {/* Hiding read posts can empty the page; say so, rather than show nothing. */}
      {shown.length === 0 && hideRead && (
        <div className="mt-16 text-center text-sm text-neutral-500">
          <p>All caught up.</p>
          <button
            onClick={flipHideRead}
            className="mt-2 text-neutral-400 underline underline-offset-4 transition hover:text-white"
          >
            Show read posts
          </button>
        </div>
      )}
    </>
  );

  /** The feed's own sidebar section, under the page links. */
  const filters = (
    <div className="space-y-6">
      {canMark && readCount === 0 && likedCount === 0 && (
        <p className="text-xs text-neutral-600">Click a card to mark it read.</p>
      )}

      {(likedCount > 0 || bookmarkedCount > 0 || (canMark && readCount > 0)) && (
        <div className="space-y-0.5">
          {likedCount > 0 && (
            <button
              onClick={() => setLikedOnly((v) => !v)}
              aria-pressed={likedOnly}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left transition ${
                likedOnly
                  ? "bg-rose-500/15 text-rose-300"
                  : "text-neutral-400 hover:bg-white/5 hover:text-rose-300"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <HeartIcon filled={likedOnly} />
                Liked
              </span>
              <span className="tabular-nums text-neutral-600">{likedCount}</span>
            </button>
          )}
          {bookmarkedCount > 0 && (
            <button
              onClick={() => setBookmarkedOnly((v) => !v)}
              aria-pressed={bookmarkedOnly}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left transition ${
                bookmarkedOnly
                  ? "bg-amber-400/15 text-amber-200"
                  : "text-neutral-400 hover:bg-white/5 hover:text-amber-200"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <BookmarkIcon filled={bookmarkedOnly} />
                Bookmarked
              </span>
              <span className="tabular-nums text-neutral-600">{bookmarkedCount}</span>
            </button>
          )}
          {canMark && readCount > 0 && (
            <button onClick={flipHideRead} aria-pressed={hideRead} className={row(false)}>
              <span className="flex items-center gap-2.5">
                {readToggleIcon()}
                {readToggleLabel}
              </span>
              <span className="tabular-nums text-neutral-600">{readCount}</span>
            </button>
          )}
        </div>
      )}

      <div>
        {/* The heading is the way to manage the list it heads. */}
        <div className="flex items-center justify-between gap-2 px-2.5">
          <Link
            href="/sources"
            className="text-xs uppercase tracking-wider text-neutral-600 transition hover:text-neutral-300"
          >
            Sources
          </Link>
          <span className="flex items-center gap-2">
            {active.length > 0 && (
              <button
                onClick={() => setActive([])}
                className="text-xs text-neutral-600 transition hover:text-neutral-300"
              >
                Clear
              </button>
            )}
            <Link
              href="/sources"
              aria-label="Manage sources"
              title="Manage sources"
              className="-m-1 rounded p-1 text-neutral-600 transition hover:text-neutral-300"
            >
              <GearIcon className="h-3.5 w-3.5" />
            </Link>
          </span>
        </div>
        <div className="mt-1.5 space-y-0.5">
          {chips.map((f) => (
            <button
              key={f.id}
              onClick={() => toggleSource(f.id)}
              aria-pressed={active.includes(f.id)}
              className={row(active.includes(f.id))}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <PlatformIcon type={f.type} className="h-3.5 w-3.5 text-neutral-500" />
                <span className="truncate">{f.label}</span>
              </span>
              <span className="tabular-nums text-neutral-600">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <SidebarLink href="/insights" label="Insights" icon={<InsightsIcon />} />

      {canMark && readCount > 0 && (
        <button
          onClick={clearRead}
          className="px-2.5 text-xs text-neutral-600 transition hover:text-neutral-300"
        >
          Reset read marks
        </button>
      )}
    </div>
  );

  return (
    <Shell
      subtitle={subtitle}
      sidebar={filters}
      status={status}
      email={email}
    >
      {top}
      <div className="feed mt-6">{posts}</div>
      {emptyState}

      {focusItem && (
        <Focus
          item={focusItem}
          position={focusIndex === -1 ? "–" : `${focusIndex + 1} / ${shown.length}`}
          read={read.has(focusItem.url)}
          liked={liked.has(focusItem.url)}
          bookmarked={bookmarks.has(focusItem.url)}
          onToggleBookmark={onToggleBookmark}
          paused={zoom !== null}
          onToggleRead={onToggleRead}
          onToggleLike={onToggleLike}
          onOpenMedia={openMedia}
          onStep={stepFocus}
          onClose={closeFocus}
        />
      )}

      {/* After the focus view, so an image opened from it lands on top. */}
      {zoom && (
        <Lightbox
          media={zoom.media}
          index={zoom.index}
          onIndex={(index) => setZoom((z) => (z ? { ...z, index } : z))}
          onClose={() => setZoom(null)}
        />
      )}
    </Shell>
  );
}
