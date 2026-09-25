"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountMenu, SignInButton } from "../account";
import { META } from "../data";
import { shortDay, timeLabel, useMarks } from "../ui";
import {
  cleanTarget,
  SOURCE_TYPES,
  sourceId,
  TYPE_INFO,
  type Source,
  type SourcesDoc,
  type SourceType,
} from "@/sources";

/**
 * The list the scraping agent works from. Edits stay local until Save, which
 * writes the whole document; the agent picks it up on its next run.
 */
export default function SourcesPage() {
  // Only the session is needed here; the marks it also loads go unused.
  const { status, email } = useMarks();

  const [doc, setDoc] = useState<SourcesDoc | null>(null);
  /** The last saved document, serialised, so Save knows whether anything changed. */
  const [saved, setSaved] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "signedIn") return;
    let live = true;
    fetch("/api/sources")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Couldn't load sources (${res.status})`);
        const d = (await res.json()) as SourcesDoc;
        if (!live) return;
        setDoc(d);
        setSaved(JSON.stringify(d));
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [status]);

  const dirty = doc !== null && JSON.stringify(doc) !== saved;

  const update = (fn: (d: SourcesDoc) => SourcesDoc) => {
    setSaveError(null);
    setDoc((d) => (d ? fn(d) : d));
  };
  const patchSource = (id: string, patch: Partial<Source>) =>
    update((d) => ({
      ...d,
      sources: d.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  const removeSource = (id: string) =>
    update((d) => ({ ...d, sources: d.sources.filter((s) => s.id !== id) }));

  const save = async () => {
    if (!doc) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/sources", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      });
      const body = (await res.json()) as SourcesDoc | { error: string };
      if (!res.ok || "error" in body) {
        throw new Error("error" in body ? body.error : `Save failed (${res.status})`);
      }
      // The server's copy is canonical — cleaned targets, stamped updatedAt.
      setDoc(body);
      setSaved(JSON.stringify(body));
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /** Grouped by type, in the fixed type order, so the list reads the same every time. */
  const groups = useMemo(
    () =>
      SOURCE_TYPES.map((t) => ({ type: t, items: doc?.sources.filter((s) => s.type === t) ?? [] }))
        .filter((g) => g.items.length > 0),
    [doc],
  );

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 pb-28 text-neutral-200 sm:px-8 sm:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[80rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(56,130,246,0.12),transparent)] blur-2xl"
      />
      <div className="relative mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-2">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-white transition hover:text-neutral-300"
            >
              Digest
            </Link>
            <span className="text-neutral-600">/</span>
            <h1 className="text-lg text-neutral-400">Sources</h1>
          </div>
          <div className="flex h-9 shrink-0 items-center">
            {status === "signedIn" && email && <AccountMenu email={email} />}
            {status === "signedOut" && <SignInButton />}
          </div>
        </header>

        <p className="mt-2 text-sm text-neutral-500">
          The agent reads this list at the start of each run. Last run used{" "}
          {META.sourcesScanned} sources, {shortDay(META.generatedAt)}{" "}
          {timeLabel(META.generatedAt)} UTC.
        </p>

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

            <section className="mt-10">
              <h2 className="text-xs uppercase tracking-wider text-neutral-500">Digest</h2>
              <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <label className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500">Look back</span>
                  <input
                    type="number"
                    min={1}
                    max={336}
                    value={doc.windowHours}
                    onChange={(e) =>
                      update((d) => ({ ...d, windowHours: Math.round(Number(e.target.value)) }))
                    }
                    className="w-20 rounded-lg bg-black/30 px-3 py-1.5 text-sm tabular-nums text-neutral-200 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-white/30"
                  />
                  <span className="text-xs text-neutral-500">hours</span>
                </label>
              </div>
            </section>
          </>
        )}
      </div>

      {/* Appears only with something to save, so it can't be missed or mistaken. */}
      {(dirty || saveError) && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-neutral-950/90 px-4 py-3 backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <p className={`text-sm ${saveError ? "text-rose-300/90" : "text-neutral-400"}`}>
              {saveError ?? "Unsaved changes · applied on the next run"}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setDoc(JSON.parse(saved) as SourcesDoc);
                  setSaveError(null);
                }}
                className="rounded-full px-3 py-1.5 text-sm text-neutral-400 transition hover:text-white"
              >
                Discard
              </button>
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
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
