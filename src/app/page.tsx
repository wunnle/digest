"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountMenu, SignInButton } from "./account";
import { FEEDS, ITEMS, META, type Media } from "./data";
import {
  ago,
  BUILT_AT,
  Card,
  Focus,
  HeartIcon,
  Lightbox,
  rangeLabel,
  shortDay,
  timeLabel,
  useMarks,
  useMinute,
  usePreference,
} from "./ui";

const stampUtc = (iso: string) => `${shortDay(iso)} ${timeLabel(iso)} UTC`;

/** Sources that contributed nothing can't narrow the feed, so they get no chip. */
const CHIPS = FEEDS.filter((f) => f.items.length > 0);

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-4 w-4" aria-hidden>
      <rect x="2" y="2" width="5" height="7" rx="1" />
      <rect x="9" y="2" width="5" height="4" rx="1" />
      <rect x="2" y="11" width="5" height="3" rx="1" />
      <rect x="9" y="8" width="5" height="6" rx="1" />
    </svg>
  );
}

function ColumnIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-4 w-4" aria-hidden>
      <rect x="4" y="2" width="8" height="5" rx="1" />
      <rect x="4" y="9" width="8" height="5" rx="1" />
    </svg>
  );
}

export default function DigestPage() {
  /** Selected source ids. Empty means everything, so the page opens complete. */
  const [active, setActive] = useState<string[]>([]);

  const { status, email, read, liked, toggleRead, toggleLike, clearRead } = useMarks();
  const minute = useMinute();

  /**
   * Marking needs a signed-in user. Signed out, the handlers are withheld and
   * the card renders as plain reading — no click target, no heart.
   */
  const canMark = status === "signedIn";
  const onToggleLike = canMark ? toggleLike : undefined;

  /**
   * One reading column with the filters in a sidebar, instead of the grid.
   * Desktop only; remembered per browser.
   */
  const [single, setSingle] = usePreference("digest:singleColumn");

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

  /** Which media set the lightbox is showing, and where in it. */
  const [zoom, setZoom] = useState<{ media: Media[]; index: number } | null>(null);
  const openMedia = useCallback((media: Media[], index: number) => setZoom({ media, index }), []);

  const shown = useMemo(
    () =>
      ITEMS.filter(
        (i) =>
          (active.length === 0 || active.includes(i.sourceId)) &&
          (!likedOnly || liked.has(i.url)) &&
          (!hideRead || !read.has(i.url) || keep.has(i.url)),
      ),
    [active, likedOnly, liked, hideRead, read, keep],
  );

  /** The post open in the focus view, by URL, and where it sits in the view. */
  const [focusUrl, setFocusUrl] = useState<string | null>(null);
  const focusIndex = focusUrl ? shown.findIndex((i) => i.url === focusUrl) : -1;
  // Looked up in everything, not just what's shown, so unliking a post under
  // "Liked only" doesn't yank it out from under the reader.
  const focusItem = focusUrl ? ITEMS.find((i) => i.url === focusUrl) : undefined;
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
  const readCount = useMemo(() => ITEMS.filter((i) => read.has(i.url)).length, [read]);
  const likedCount = useMemo(() => ITEMS.filter((i) => liked.has(i.url)).length, [liked]);

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

  return (
    <main className="relative min-h-screen overflow-x-clip px-4 py-8 text-neutral-200 sm:px-8 sm:py-12">
      {/* Cool ambient wash behind the top rows, so the page isn't flat black */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[80rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(56,130,246,0.12),transparent)] blur-2xl"
      />
      <div className="relative mx-auto max-w-[95rem]">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-white">Digest</h1>
            <p
              className="truncate text-sm text-neutral-500"
              title={`Collected ${stampUtc(META.generatedAt)} · deployed ${stampUtc(BUILT_AT)}`}
            >
              {rangeLabel(META.window.start, META.window.end)} · {ITEMS.length} posts
              {/* Relative once the client knows the time; the exact stamp until then. */}
              {BUILT_AT && (
                <> · updated {minute === null ? stampUtc(BUILT_AT) : ago(BUILT_AT, minute)}</>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {/* Below md everything is one column anyway, so the switch only exists on desktop. */}
            <div className="hidden rounded-lg p-0.5 ring-1 ring-inset ring-white/10 md:flex" role="group" aria-label="Layout">
              {([false, true] as const).map((one) => (
                <button
                  key={String(one)}
                  onClick={() => setSingle(one)}
                  aria-pressed={single === one}
                  aria-label={one ? "Single column" : "Grid"}
                  title={one ? "Single column" : "Grid"}
                  className={`rounded-md p-1.5 transition ${
                    single === one ? "bg-white/10 text-white" : "text-neutral-500 hover:text-neutral-200"
                  }`}
                >
                  {one ? <ColumnIcon /> : <GridIcon />}
                </button>
              ))}
            </div>

            {/* Nothing until the session check lands, so the control doesn't flash. */}
            <div className="flex h-9 shrink-0 items-center">
              {status === "signedIn" && email && <AccountMenu email={email} />}
              {status === "signedOut" && <SignInButton />}
            </div>
          </div>
        </header>

        {authError && <p className="mt-3 text-sm text-rose-300/80">{authError}</p>}

        {/* One row. It scrolls sideways on a phone rather than wrapping into a
            block that pushes the posts down. */}
        <div
          className={`-mx-4 mt-5 flex items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 ${
            single ? "md:hidden" : ""
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
              <span className="mx-1 h-3.5 w-px shrink-0 bg-white/10" aria-hidden />
            </>
          )}

          {CHIPS.map((f) => (
            <button
              key={f.id}
              onClick={() => toggleSource(f.id)}
              aria-pressed={active.includes(f.id)}
              className={chip(active.includes(f.id))}
            >
              {f.label}
              <span className="tabular-nums text-neutral-600">{f.items.length}</span>
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
              <button onClick={flipHideRead} aria-pressed={hideRead} className={chip(hideRead)}>
                Hide read
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
          <p className={`mt-3 text-xs text-neutral-600 ${single ? "md:hidden" : ""}`}>
            Click a card to mark it read.
          </p>
        )}

        {single ? (
          /* A sidebar of filters beside one readable column. The column is
             capped at a comfortable line length rather than filling the width. */
          <div className="mt-6 md:mt-8 md:grid md:grid-cols-[13rem_minmax(0,42rem)] md:justify-center md:gap-10">
            <aside className="hidden md:block">
              <div className="sticky top-6 space-y-6 text-sm">
                {canMark && readCount === 0 && likedCount === 0 && (
                  <p className="text-xs text-neutral-600">Click a card to mark it read.</p>
                )}

                {(likedCount > 0 || (canMark && readCount > 0)) && (
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
                        <span className="flex items-center gap-2">
                          <HeartIcon filled={likedOnly} className="h-3.5 w-3.5" />
                          Liked
                        </span>
                        <span className="tabular-nums text-neutral-600">{likedCount}</span>
                      </button>
                    )}
                    {canMark && readCount > 0 && (
                      <button onClick={flipHideRead} aria-pressed={hideRead} className={row(hideRead)}>
                        Hide read
                        <span className="tabular-nums text-neutral-600">{readCount}</span>
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-baseline justify-between px-2.5">
                    <h2 className="text-xs uppercase tracking-wider text-neutral-600">Sources</h2>
                    {active.length > 0 && (
                      <button
                        onClick={() => setActive([])}
                        className="text-xs text-neutral-600 transition hover:text-neutral-300"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {CHIPS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => toggleSource(f.id)}
                        aria-pressed={active.includes(f.id)}
                        className={row(active.includes(f.id))}
                      >
                        <span className="truncate">{f.label}</span>
                        <span className="tabular-nums text-neutral-600">{f.items.length}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {canMark && readCount > 0 && (
                  <button
                    onClick={clearRead}
                    className="px-2.5 text-xs text-neutral-600 transition hover:text-neutral-300"
                  >
                    Reset read marks
                  </button>
                )}
              </div>
            </aside>

            <div>
              {shown.map((i) => (
                <Card
                  key={i.url}
                  item={i}
                  read={read.has(i.url)}
                  liked={liked.has(i.url)}
                  onToggleRead={onToggleRead}
                  onToggleLike={onToggleLike}
                  onOpenMedia={openMedia}
                  onExpand={setFocusUrl}
                />
              ))}
            </div>
          </div>
        ) : (
          /* One continuous masonry, newest first. Masonry rather than a grid
             because post lengths run from 15 to 1200-odd characters, and
             equal-height rows leave short posts stranded beside long ones. */
          <div className="mt-6 gap-4 md:columns-2 xl:columns-3">
          {shown.map((i) => (
            <Card
              key={i.url}
              item={i}
              read={read.has(i.url)}
              liked={liked.has(i.url)}
              onToggleRead={onToggleRead}
              onToggleLike={onToggleLike}
              onOpenMedia={openMedia}
              onExpand={setFocusUrl}
            />
          ))}
          </div>
        )}

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

        {focusItem && (
          <Focus
            item={focusItem}
            position={focusIndex === -1 ? "–" : `${focusIndex + 1} / ${shown.length}`}
            read={read.has(focusItem.url)}
            liked={liked.has(focusItem.url)}
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
      </div>
    </main>
  );
}
