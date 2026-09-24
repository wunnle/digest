"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AUTHORS, ITEMS, META, type Media } from "./data";
import { Card, HeartIcon, Lightbox, rangeLabel, shortDay, timeLabel, useMarks } from "./ui";

/** Accounts that contributed nothing can't narrow the feed, so they get no chip. */
const CHIPS = AUTHORS.filter((a) => a.items.length > 0);

/**
 * Signed in: a small gradient avatar with your initial. The email and sign-out
 * live behind it, since neither is something you need to see while reading.
 */
function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account"
        className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 via-violet-500 to-rose-400 text-sm font-semibold uppercase text-white shadow-lg shadow-violet-500/20 ring-2 ring-neutral-950 transition hover:scale-105 focus:outline-none focus-visible:ring-white/40"
      >
        {email[0]}
        {/* A little "you're in" dot. */}
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-neutral-950" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 text-sm shadow-2xl backdrop-blur">
          <div className="px-3.5 py-3">
            <p className="text-xs text-neutral-500">Signed in as</p>
            <p className="mt-0.5 truncate text-neutral-200">{email}</p>
          </div>
          <form action="/api/auth/logout" method="post" className="border-t border-white/10">
            <button className="w-full px-3.5 py-2.5 text-left text-neutral-400 transition hover:bg-white/5 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function DigestPage() {
  /** Selected handles. Empty means everything, so the page opens complete. */
  const [active, setActive] = useState<string[]>([]);

  const { status, email, read, liked, toggleRead, toggleLike, clearRead } = useMarks();

  /**
   * Marking needs a signed-in user. Signed out, the handlers are withheld and
   * the card renders as plain reading — no click target, no heart.
   */
  const canMark = status === "signedIn";
  const onToggleRead = canMark ? toggleRead : undefined;
  const onToggleLike = canMark ? toggleLike : undefined;

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

  const chip = (on: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition ${
      on ? "bg-white/10 text-white" : "text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
    }`;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 text-neutral-200 sm:px-8 sm:py-12">
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
              title={`Updated ${shortDay(META.generatedAt)} ${timeLabel(META.generatedAt)} UTC`}
            >
              {rangeLabel(META.window.start, META.window.end)} · {ITEMS.length} posts
            </p>
          </div>

          {/* Nothing until the session check lands, so the control doesn't flash. */}
          <div className="flex h-9 shrink-0 items-center">
            {status === "signedIn" && email && <AccountMenu email={email} />}
            {/* Google's dark-theme button: #131314 fill, #8E918F outline,
                the four-colour G. */}
            {status === "signedOut" && (
              <a
                href="/api/auth/login"
                className="flex h-9 items-center gap-2 rounded-full border border-[#8E918F] bg-[#131314] px-3.5 text-sm font-medium text-[#E3E3E3] transition hover:bg-[#1f1f20] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <GoogleIcon />
                <span className="hidden sm:inline">Sign in with Google</span>
                <span className="sm:hidden">Sign in</span>
              </a>
            )}
          </div>
        </header>

        {authError && <p className="mt-3 text-sm text-rose-300/80">{authError}</p>}

        {/* One row. It scrolls sideways on a phone rather than wrapping into a
            block that pushes the posts down. */}
        <div className="-mx-4 mt-5 flex items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
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

          {CHIPS.map((a) => (
            <button
              key={a.handle}
              onClick={() => toggleAccount(a.handle)}
              aria-pressed={active.includes(a.handle)}
              className={chip(active.includes(a.handle))}
            >
              {a.handle}
              <span className="tabular-nums text-neutral-600">{a.items.length}</span>
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

          {/* Without this, marking everything read leaves a page of faded cards
              and no way back. */}
          {readCount > 0 && (
            <button
              onClick={clearRead}
              className="ml-auto shrink-0 px-2 py-1 text-xs text-neutral-600 transition hover:text-neutral-300"
            >
              {readCount} read · reset
            </button>
          )}
        </div>

        {/* Click-to-read isn't discoverable on its own. Once something's been
            marked, the hint has done its job. */}
        {canMark && readCount === 0 && likedCount === 0 && (
          <p className="mt-3 text-xs text-neutral-600">Click a card to mark it read.</p>
        )}

        {/* One continuous masonry, newest first. Masonry rather than a grid
            because post lengths run from 15 to 1200-odd characters, and
            equal-height rows leave short posts stranded beside long ones. */}
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
            />
          ))}
        </div>

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
