"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { InsightRow, Insights } from "@/insights";
import { TYPE_INFO, type SourceType } from "@/sources";
import { Shell } from "../shell";
import { shortDay, useMarks } from "../ui";

/**
 * Likes per source, against the posts each source put in front of me. The
 * page exists to answer one question — which sources earn their place — so
 * sources with no likes are split out below as the ones to consider cutting.
 */
export default function InsightsPage() {
  const { status, email } = useMarks();
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "signedIn") return;
    let live = true;
    fetch("/api/insights")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Couldn't load insights (${res.status})`);
        const d = (await res.json()) as Insights;
        if (live) setData(d);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [status]);

  const { liked, unliked, max } = useMemo(() => {
    const rows = data?.rows ?? [];
    return {
      // Most-liked first; a tie goes to the source that wastes less of the digest.
      // Unattributed likes go last — they can't inform a cut.
      liked: rows
        .filter((r) => r.likes > 0)
        .sort(
          (a, b) =>
            Number(a.id === "unknown") - Number(b.id === "unknown") ||
            b.likes - a.likes ||
            (b.rate ?? 0) - (a.rate ?? 0),
        ),
      // Loudest first: a source posting a lot and never liked is the clearest cut.
      unliked: rows.filter((r) => r.likes === 0).sort((a, b) => b.posts - a.posts),
      // One scale for every row, so bar lengths compare across the two groups.
      max: Math.max(1, ...rows.filter((r) => r.id !== "unknown").map((r) => r.posts)),
    };
  }, [data]);

  return (
    <Shell title="Insights" status={status} email={email}>

      {status === "signedOut" && (
        <p className="mt-10 text-sm text-neutral-400">Sign in to see your insights.</p>
      )}
      {error && <p className="mt-10 text-sm text-rose-300/80">{error}</p>}

      {data && (
        <>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="text-sm text-neutral-500">
              {data.totalLikes} {data.totalLikes === 1 ? "like" : "likes"} from {data.totalPosts}{" "}
              posts
              {data.since && <> since {shortDay(data.since)}</>}
            </p>
            <Link href="/sources" className="text-sm text-neutral-500 transition hover:text-white">
              Manage sources →
            </Link>
          </div>

          {data.totalLikes === 0 ? (
            <p className="mt-16 text-center text-sm text-neutral-500">
              Like a few posts and they&apos;ll show up here.
            </p>
          ) : (
            <>
              {/* Two segments per bar, so two keys — identity never rests on colour alone. */}
              <div className="mt-8 flex items-center gap-4 text-xs text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" aria-hidden />
                  Liked
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/25" aria-hidden />
                  Shown, not liked
                </span>
              </div>

              <Chart rows={liked} max={max} className="mt-3" />

              {unliked.length > 0 && (
                <section className="mt-10">
                  <h2 className="text-xs uppercase tracking-wider text-neutral-500">
                    No likes yet
                    <span className="ml-2 normal-case tracking-normal text-neutral-600">
                      — candidates to cut
                    </span>
                  </h2>
                  <Chart rows={unliked} max={max} className="mt-3 opacity-70" />
                </section>
              )}
            </>
          )}
        </>
      )}
    </Shell>
  );
}

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

function Chart({ rows, max, className = "" }: { rows: InsightRow[]; max: number; className?: string }) {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <ul className={`divide-y divide-white/5 ${className}`}>
      {rows.map((r) => {
        const width = (r.posts / max) * 100;
        const likedShare = r.posts > 0 ? r.likes / r.posts : 0;
        const unknown = r.id === "unknown";
        const status = !r.inList ? "removed" : !r.enabled ? "paused" : null;
        return (
          // The whole row is the hover target — far bigger than a 12px bar.
          <li
            key={r.id}
            onMouseEnter={() => setHover(r.id)}
            onMouseLeave={() => setHover((h) => (h === r.id ? null : h))}
            className="relative grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 py-2.5 sm:grid-cols-[minmax(0,13rem)_1fr_auto]"
          >
            <div className="min-w-0">
              <p className="flex items-baseline gap-1.5">
                <span className="truncate text-sm text-neutral-200">{r.label}</span>
                {status && <span className="shrink-0 text-[11px] text-neutral-600">{status}</span>}
              </p>
              <p className="truncate text-[11px] text-neutral-600">
                {unknown
                  ? "Liked before sources were recorded"
                  : `${TYPE_INFO[r.type as SourceType]?.label ?? r.type}${r.name ? ` · ${r.name}` : ""}`}
              </p>
            </div>

            {/* Grows from one baseline on a shared scale. Liked is the solid
                segment; the rest of what was shown is a tint of the same hue,
                2px apart, rounded only at the data end. */}
            <div className="flex h-3 items-stretch" aria-hidden>
              {/* No posts on record to measure against, so no bar. */}
              {r.posts > 0 && !unknown && (
                <div className="flex h-full" style={{ width: `${width}%` }}>
                  {r.likes > 0 && (
                    <div
                      className={`h-full bg-rose-500 ${likedShare === 1 ? "rounded-r" : ""}`}
                      style={{ width: `${likedShare * 100}%` }}
                    />
                  )}
                  {r.likes < r.posts && (
                    <div
                      className={`h-full flex-1 rounded-r bg-rose-500/25 ${r.likes > 0 ? "ml-[2px]" : ""}`}
                    />
                  )}
                </div>
              )}
            </div>

            <p className="w-24 text-right text-xs tabular-nums text-neutral-400">
              {unknown ? (
                <>{r.likes} liked</>
              ) : (
                <>
                  {r.likes} / {r.posts}
                  <span className="ml-1.5 text-neutral-600">{pct(r.rate)}</span>
                </>
              )}
            </p>

            {hover === r.id && (
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs text-neutral-300 shadow-xl backdrop-blur"
              >
                <p className="font-medium text-neutral-100">{r.label}</p>
                <p className="mt-0.5 text-neutral-400">
                  {unknown ? `${r.likes} liked` : `${r.likes} liked of ${r.posts} shown · ${pct(r.rate)}`}
                </p>
                {r.lastLikedAt && (
                  <p className="text-neutral-500">Last liked {shortDay(r.lastLikedAt)}</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
