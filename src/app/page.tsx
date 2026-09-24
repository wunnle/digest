"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AUTHORS, DAYS, ITEMS, META, type Media } from "./data";
import { Card, Lightbox, rangeLabel, stamp, useMarks } from "./ui";

type View = "feed" | "authors";

const VIEWS: { id: View; label: string }[] = [
  { id: "feed", label: "Feed" },
  { id: "authors", label: "By author" },
];

export default function DigestPage() {
  const [view, setView] = useState<View>("feed");
  /** Selected handles. Empty means everything, so the page opens complete. */
  const [active, setActive] = useState<string[]>([]);

  /**
   * The view lives in the hash so `/#authors` is a shareable link. Read
   * after mount rather than during render — the server has no hash, and seeding
   * state from it directly would mismatch hydration.
   */
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (VIEWS.some((v) => v.id === h)) setView(h as View);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const pick = (v: View) => {
    setView(v);
    history.replaceState(null, "", v === "feed" ? " " : `#${v}`);
  };

  const { status, email, read, liked, toggleRead, toggleLike, clearRead } = useMarks();

  /**
   * Marking needs a signed-in user. Signed out, the handlers are withheld and
   * the card renders as plain reading — no click target, no heart.
   */
  const canMark = status === "signedIn";
  const onToggleRead = canMark ? toggleRead : undefined;
  const onToggleLike = canMark ? toggleLike : undefined;

  /** Set by the OAuth callback when it turns a sign-in away. Read after mount,
      like the hash, so the static page doesn't depend on the query. */
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

  const on = (handle: string) => active.length === 0 || active.includes(handle);

  const shown = useMemo(
    () =>
      ITEMS.filter(
        (i) =>
          (active.length === 0 || active.includes(i.handle)) && (!likedOnly || liked.has(i.url)),
      ),
    [active, likedOnly, liked],
  );

  /** Counted over the whole payload, not the filtered view, so the numbers
      don't appear to drop when a filter hides posts. */
  const readCount = useMemo(() => ITEMS.filter((i) => read.has(i.url)).length, [read]);
  const likedCount = useMemo(() => ITEMS.filter((i) => liked.has(i.url)).length, [liked]);

  const toggleAccount = (h: string) =>
    setActive((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]));

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-4 py-10 text-neutral-200 sm:px-8 sm:py-14">
      {/* Cool ambient wash behind the top rows, so the page isn't flat black */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[80rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(56,130,246,0.14),transparent)] blur-2xl"
      />
      <div className="relative mx-auto max-w-[95rem]">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p className="text-sm uppercase tracking-widest text-neutral-500">
              {META.window.duration_hours}-hour digest · {META.window.timezone}
            </p>
            {/* The page is its window, so the window is the title. */}
            <h1 className="mt-1 text-4xl font-light tracking-tight text-white sm:text-5xl">
              {rangeLabel(META.window.start, META.window.end)}
            </h1>
          </div>

          {/* Counts live in the header's dead right-hand space instead of another paragraph */}
          <dl className="flex items-end gap-6 text-neutral-400">
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">Posts</dt>
              <dd className="text-2xl font-semibold text-white">{ITEMS.length}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">Accounts</dt>
              <dd className="text-2xl font-semibold text-white">
                {META.accountsWithPosts}
                <span className="text-neutral-600">/{META.accountsScanned}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">Days</dt>
              <dd className="text-2xl font-semibold text-white">{DAYS.length}</dd>
            </div>
          </dl>
        </header>

        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-neutral-500">{META.filter}</p>
        {/* Click-to-read isn't discoverable on its own, and signed out it
            doesn't exist — so the hint and the account control share a line. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-neutral-600">
          <p>
            {canMark
              ? "Click a card to mark it read. Click an image to enlarge it."
              : "Click an image to enlarge it."}
          </p>
          {status === "signedIn" && (
            <form action="/api/auth/logout" method="post" className="flex items-center gap-2">
              <span className="text-neutral-500">{email}</span>
              <button className="underline underline-offset-4 hover:text-neutral-300">
                sign out
              </button>
            </form>
          )}
          {status === "signedOut" && (
            <a
              href="/api/auth/login"
              className="text-neutral-400 underline underline-offset-4 hover:text-white"
            >
              Sign in with Google to mark and like posts
            </a>
          )}
          {authError && <p className="text-rose-300/80">{authError}</p>}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* View switch first — it changes what the account filter applies to */}
          <div className="flex rounded-full p-0.5 ring-1 ring-inset ring-white/10">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => pick(v.id)}
                aria-pressed={view === v.id}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  view === v.id ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Only appears once there's something saved — an always-on filter
              that can only ever show nothing is just a dead control. */}
          {likedCount > 0 && (
            <button
              onClick={() => setLikedOnly((v) => !v)}
              aria-pressed={likedOnly}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm ring-1 ring-inset transition ${
                likedOnly
                  ? "bg-rose-500/20 text-rose-200 ring-rose-400/40"
                  : "text-neutral-400 ring-white/10 hover:text-rose-300 hover:ring-rose-400/30"
              }`}
            >
              Liked
              <span className="text-neutral-500">{likedCount}</span>
            </button>
          )}

          <span className="hidden h-5 w-px bg-white/10 sm:block" aria-hidden />

          {AUTHORS.map((a) => {
            const sel = active.includes(a.handle);
            return (
              <button
                key={a.handle}
                onClick={() => toggleAccount(a.handle)}
                aria-pressed={sel}
                className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm ring-1 ring-inset transition ${
                  sel
                    ? "bg-white/15 text-white ring-white/30"
                    : "bg-transparent text-neutral-400 ring-white/10 hover:text-white"
                }`}
              >
                <span className="font-mono text-xs">@{a.handle}</span>
                <span className="text-neutral-500">{a.items.length}</span>
              </button>
            );
          })}

          {active.length > 0 && (
            <button
              onClick={() => setActive([])}
              className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-300"
            >
              clear
            </button>
          )}

          {/* Without this, marking everything read leaves a page of faded cards
              and no way back. */}
          {readCount > 0 && (
            <button
              onClick={clearRead}
              className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-300"
            >
              {readCount} read · reset
            </button>
          )}
        </div>

        {view === "feed" ? (
          /* One continuous masonry, newest first — no day breaks. Each card
             carries its own date instead. Masonry rather than a grid because
             post lengths run from 15 to 1200-odd characters, and equal-height
             rows leave short posts stranded beside long ones. */
          <div className="mt-8 gap-4 md:columns-2 xl:columns-3">
            {shown.map((i) => (
              <Card
                key={i.url}
                item={i}
                read={read.has(i.url)}
                liked={liked.has(i.url)}
                onToggleRead={onToggleRead}
                onToggleLike={onToggleLike}
                onOpenMedia={openMedia}
              />
            ))}
          </div>
        ) : (
          <div className="mt-8 space-y-10">
            {AUTHORS.filter((a) => on(a.handle)).map((a) => (
              <section key={a.handle}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                    {a.name}
                  </h2>
                  <a
                    href={`https://x.com/${a.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
                  >
                    @{a.handle}
                  </a>
                  <span className="text-sm text-neutral-600">
                    {a.items.length} {a.items.length === 1 ? "post" : "posts"}
                  </span>
                </div>

                {/* An account that produced nothing is a result, not a gap —
                    the payload's note says why, so show it rather than hide the row. */}
                {a.note && (
                  <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-neutral-500">
                    {a.note}
                  </p>
                )}

                {a.items.length > 0 && (
                  <div className="mt-3 gap-4 md:columns-2 xl:columns-3">
                    {a.items.map((i) => (
                      <Card
                        key={i.url}
                        item={i}
                        showAuthor={false}
                        read={read.has(i.url)}
                        liked={liked.has(i.url)}
                        onToggleRead={onToggleRead}
                        onToggleLike={onToggleLike}
                        onOpenMedia={openMedia}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {zoom && (
          <Lightbox
            media={zoom.media}
            index={zoom.index}
            onIndex={(index) => setZoom((z) => (z ? { ...z, index } : z))}
            onClose={() => setZoom(null)}
          />
        )}

        {/* Only the payload's own account of itself. */}
        <footer className="mt-14 grid gap-3 border-t border-white/10 pt-6 text-sm leading-relaxed text-neutral-600 sm:grid-cols-2">
          {META.fields && <p className="sm:col-span-2">{META.fields}</p>}
          {META.note && <p className="sm:col-span-2">{META.note}</p>}
          <p className="sm:col-span-2">
            {META.source} · generated {stamp(META.generatedAt)} {META.window.timezone}
          </p>
        </footer>
      </div>
    </main>
  );
}
