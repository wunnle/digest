"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "../shell";
import { META } from "../data";
import { PlatformIcon, shortDay, timeLabel, useMarks } from "../ui";
import {
  cleanTarget,
  detectSource,
  SOURCE_TYPES,
  sourceId,
  TYPE_INFO,
  type Source,
  type SourcesDoc,
  type SourceType,
} from "@/sources";

/**
 * The list the scraping agent works from. Every edit saves as it's made —
 * the agent picks the list up on its next run.
 */
export default function SourcesPage() {
  // Only the session is needed here; the marks it also loads go unused.
  const { status, email } = useMarks();

  const [doc, setDoc] = useState<SourcesDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  /** The newest local copy, so a save always sends the latest edit. */
  const latest = useRef<SourcesDoc | null>(null);
  const inFlight = useRef(false);
  const queued = useRef(false);

  useEffect(() => {
    if (status !== "signedIn") return;
    let live = true;
    fetch("/api/sources")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Couldn't load sources (${res.status})`);
        const d = (await res.json()) as SourcesDoc;
        if (!live) return;
        latest.current = d;
        setDoc(d);
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [status]);

  /**
   * Every edit saves itself. Saves run one at a time: an edit made while one
   * is in flight is sent right after it, as the latest whole document, so
   * quick clicks can't land out of order.
   */
  const flush = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    setSaveState("saving");
    setSaveError(null);
    try {
      do {
        queued.current = false;
        const sending = latest.current;
        const res = await fetch("/api/sources", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(sending),
        });
        const body = (await res.json()) as SourcesDoc | { error: string };
        if (!res.ok || "error" in body) {
          throw new Error("error" in body ? body.error : `Save failed (${res.status})`);
        }
        // The server's copy is canonical (cleaned targets, stamped updatedAt),
        // but only adopt it if nothing changed locally while it was in flight.
        if (!queued.current && latest.current === sending) {
          latest.current = body;
          setDoc(body);
        }
      } while (queued.current);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setSaveError((e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, []);

  const update = (fn: (d: SourcesDoc) => SourcesDoc) => {
    if (!latest.current) return;
    const next = fn(latest.current);
    latest.current = next;
    setDoc(next);
    void flush();
  };
  const patchSource = (id: string, patch: Partial<Source>) =>
    update((d) => ({
      ...d,
      sources: d.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  const removeSource = (id: string) =>
    update((d) => ({ ...d, sources: d.sources.filter((s) => s.id !== id) }));

  // Closing the tab mid-save, or with a failed one, would lose the edit.
  useEffect(() => {
    if (saveState !== "saving" && saveState !== "error") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  /** Grouped by type, in the fixed type order, so the list reads the same every time. */
  const groups = useMemo(
    () =>
      SOURCE_TYPES.map((t) => ({ type: t, items: doc?.sources.filter((s) => s.type === t) ?? [] }))
        .filter((g) => g.items.length > 0),
    [doc],
  );

  return (
    <Shell title="Sources" status={status} email={email}>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <p className="text-neutral-500">
          The agent reads this list at the start of each run. Last run used{" "}
          {META.sourcesScanned} sources, {shortDay(META.generatedAt)}{" "}
          {timeLabel(META.generatedAt)} UTC.
        </p>
        {/* Changes save as they're made; this just says how that's going. */}
        <p aria-live="polite" className="shrink-0 text-xs">
          {saveState === "saving" && <span className="text-neutral-500">Saving…</span>}
          {saveState === "saved" && <span className="text-neutral-600">Saved</span>}
          {saveState === "error" && (
            <span className="text-rose-300/90">
              Couldn&apos;t save{saveError ? `: ${saveError}` : ""} ·{" "}
              <button onClick={() => void flush()} className="underline underline-offset-4 hover:text-rose-200">
                Retry
              </button>
            </span>
          )}
        </p>
      </div>

      {status === "signedOut" && (
        <p className="mt-10 text-sm text-neutral-400">Sign in to manage sources.</p>
      )}
      {loadError && <p className="mt-10 text-sm text-rose-300/80">{loadError}</p>}

      {doc && (
        <>
          <AddSource
            existing={doc.sources}
            onAdd={(s) => update((d) => ({ ...d, sources: [...d.sources, s] }))}
          />

          <div className="mt-8 space-y-8">
            {groups.map((g) => (
              <section key={g.type}>
                <h2 className="flex items-baseline gap-2 text-xs uppercase tracking-wider text-neutral-500">
                  <PlatformIcon type={g.type} className="h-3 w-3 self-center" />
                  {TYPE_INFO[g.type].label}
                  <span className="tabular-nums text-neutral-700">{g.items.length}</span>
                </h2>
                <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
                  {g.items.map((s) => (
                    <SourceRow
                      key={s.id}
                      source={s}
                      onPatch={(p) => patchSource(s.id, p)}
                      onRemove={() => removeSource(s.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {groups.length === 0 && (
              <p className="text-sm text-neutral-500">No sources yet. Add one above.</p>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

const input =
  "rounded-lg bg-black/30 px-3 py-2 text-sm text-neutral-200 ring-1 ring-inset ring-white/10 placeholder:text-neutral-600 focus:outline-none focus:ring-white/30";

function AddSource({ existing, onAdd }: { existing: Source[]; onAdd: (s: Source) => void }) {
  const [type, setType] = useState<SourceType>("x");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = cleanTarget(type, target);
    if ("error" in cleaned) return setError(cleaned.error);
    const id = sourceId(type, cleaned.target);
    if (existing.some((s) => s.id === id)) return setError("Already in the list");
    onAdd({
      id,
      type,
      target: cleaned.target,
      enabled: true,
      addedAt: new Date().toISOString(),
    });
    setTarget("");
    setError(null);
  };

  return (
    <form onSubmit={submit} className="mt-8">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as SourceType);
            setError(null);
          }}
          aria-label="Type"
          className={`${input} sm:w-32`}
        >
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_INFO[t].label}
            </option>
          ))}
        </select>
        <input
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setError(null);
            // Pick the type from what was pasted; the select stays as an override.
            const found = detectSource(e.target.value);
            if (found) setType(found.type);
          }}
          placeholder={TYPE_INFO[type].placeholder}
          aria-label="Handle or URL"
          aria-invalid={!!error}
          className={`${input} min-w-0 flex-1 ${error ? "ring-rose-400/50" : ""}`}
        />
        <button className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15">
          Add
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-300/90">{error}</p>}
    </form>
  );
}

function SourceRow({
  source: s,
  onPatch,
  onRemove,
}: {
  source: Source;
  onPatch: (p: Partial<Source>) => void;
  onRemove: () => void;
}) {
  const handleLike = TYPE_INFO[s.type].target === "handle";
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${s.enabled ? "" : "opacity-50"}`}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm text-neutral-100">
            {handleLike ? `@${s.target}` : s.target}
          </span>
          {s.label && <span className="text-xs text-neutral-500">{s.label}</span>}
        </p>
      </div>

      <button
        role="switch"
        aria-checked={s.enabled}
        aria-label={s.enabled ? "Pause" : "Resume"}
        title={s.enabled ? "Pause" : "Resume"}
        onClick={() => onPatch({ enabled: !s.enabled })}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          s.enabled ? "bg-emerald-500/70" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            s.enabled ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>

      <button
        onClick={onRemove}
        aria-label={`Remove ${s.target}`}
        title="Remove"
        className="-m-1 shrink-0 rounded-full p-1 text-neutral-600 transition hover:bg-white/5 hover:text-rose-300"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </li>
  );
}
