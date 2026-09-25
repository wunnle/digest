// Merges every run the agent has written into the one payload the site reads.
//
// Each run is a file in runs/ (and, for older setups, digest-data.json at the
// root). Runs overlap — each covers the 48 hours before it — so posts are
// de-duplicated by URL, the newest run's copy winning. Posts older than 30
// days before the newest run are left out. The result goes to
// src/generated/digest.json, which the site imports.
//
// Every run is checked first. A post whose text carries X's page chrome —
// the author/handle lines, "Show more", view and engagement counts, the
// timestamp line — fails the build, so a bad run never deploys and the last
// good version stays live.
//
// Runs before `next dev` and `next build` (see package.json).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const RUNS = join(ROOT, "runs");
const LEGACY = join(ROOT, "digest-data.json");
const OUT_DIR = join(ROOT, "src", "generated");
const OUT = join(OUT_DIR, "digest.json");
const KEEP_DAYS = 30;

const files = [
  ...(existsSync(RUNS)
    ? readdirSync(RUNS)
        .filter((f) => f.endsWith(".json"))
        .map((f) => join(RUNS, f))
    : []),
  ...(existsSync(LEGACY) ? [LEGACY] : []),
];
if (files.length === 0) fail(["No runs found: add a file to runs/."]);

const rel = (p) => p.slice(ROOT.length);

// ---- Check -----------------------------------------------------------------

/** X page furniture that should never be part of a post's text. */
const CHROME = [
  [/^Show more$|Show more$/m, `"Show more"`],
  [/^Views$/m, "a view count"],
  [/^Replying to @\w+/m, `"Replying to @…"`],
  [/^\d{1,2}:\d{2}\s*·\s*\d{1,2} [A-Z][a-z]{2,8}\.? \d{4}$/m, "a timestamp line"],
];

function check(run, file) {
  const errors = [];
  const where = rel(file);
  if (typeof run?.generated_at !== "string" || Number.isNaN(Date.parse(run.generated_at))) {
    errors.push(`${where}: generated_at must be an ISO timestamp`);
  }
  if (!Array.isArray(run?.digest)) {
    errors.push(`${where}: digest must be a list`);
    return errors;
  }
  const seen = new Set();
  for (const e of run.digest) {
    for (const i of e.items ?? []) {
      const at = `${where}: ${i.url ?? "(no url)"}`;
      if (typeof i.url !== "string" || !i.url.startsWith("https://")) errors.push(`${at}: url must be https`);
      else if (seen.has(i.url)) errors.push(`${at}: duplicate url`);
      seen.add(i.url);
      if (Number.isNaN(Date.parse(i.published_at))) errors.push(`${at}: published_at must be an ISO timestamp`);
      // Text may be left out only where a title carries the item (YouTube).
      if (typeof i.text !== "string") {
        if (i.text === undefined && typeof i.title === "string") continue;
        errors.push(`${at}: text must be a string`);
        continue;
      }
      // The byline copied in as the first lines: "Name\n@handle\n…"
      const handle = e.handle ?? "";
      if (
        (e.name && i.text.startsWith(`${e.name}\n@`)) ||
        (handle && i.text.startsWith(`@${handle}\n`))
      ) {
        errors.push(`${at}: text starts with the author's name/handle`);
      }
      for (const [re, what] of CHROME) {
        if (re.test(i.text)) errors.push(`${at}: text contains ${what}`);
      }
      // Quoted posts and the author's replies are post text too.
      if (i.author_replies !== undefined && !Array.isArray(i.author_replies)) {
        errors.push(`${at}: author_replies must be a list`);
      }
      const nested = [
        ["quote_tweet", i.quote_tweet],
        ["author_reply", i.author_reply],
        ...(Array.isArray(i.author_replies) ? i.author_replies.map((r, n) => [`author_replies[${n}]`, r]) : []),
      ];
      for (const [field, q] of nested) {
        if (!q) continue;
        if (typeof q.text !== "string") {
          errors.push(`${at}: ${field}.text must be a string`);
          continue;
        }
        const name = q.author?.name;
        const h = q.author?.handle;
        if ((name && q.text.startsWith(`${name}\n@`)) || (h && q.text.startsWith(`@${h}\n`))) {
          errors.push(`${at}: ${field}.text starts with the author's name/handle`);
        }
        for (const [re, what] of CHROME) {
          if (re.test(q.text)) errors.push(`${at}: ${field}.text contains ${what}`);
        }
      }
    }
  }
  return errors;
}

function fail(lines) {
  console.error(
    [
      "",
      "✖ digest: refusing to build from these runs.",
      ...lines.map((l) => `  - ${l}`),
      "",
      "  `text` must be only the post's own words. See AGENT.md, step 3.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const runs = files.map((file) => {
  let run;
  try {
    run = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail([`${rel(file)}: not valid JSON (${e.message})`]);
  }
  return { file, run };
});
const errors = runs.flatMap(({ file, run }) => check(run, file));
if (errors.length) fail(errors.length > 25 ? [...errors.slice(0, 25), `…and ${errors.length - 25} more`] : errors);

// ---- Merge -----------------------------------------------------------------

runs.sort((a, b) => a.run.generated_at.localeCompare(b.run.generated_at));
const latest = runs.at(-1).run;
const cutoff = new Date(Date.parse(latest.generated_at) - KEEP_DAYS * 864e5).toISOString();

const idOf = (e) => (e.source_id ?? `x:${e.handle ?? e.name}`).toLowerCase();

/** source id → entry (newest run's name/handle/type), and url → item. */
const entries = new Map();
const items = new Map();
for (const { run } of runs) {
  for (const e of run.digest) {
    const id = idOf(e);
    const meta = { ...e };
    delete meta.items;
    entries.set(id, { ...entries.get(id), ...meta, source_id: id });
    for (const i of e.items ?? []) {
      if (i.published_at >= cutoff) items.set(i.url, { ...i, _source: id });
    }
  }
}

const bySource = new Map([...entries.keys()].map((id) => [id, []]));
for (const i of items.values()) {
  const { _source, ...item } = i;
  bySource.get(_source).push(item);
}

const kept = runs.filter(({ run }) => run.window?.end >= cutoff).map(({ run }) => run);
const start = kept.map((r) => r.window?.start).filter(Boolean).sort()[0] ?? cutoff;

const out = {
  generated_at: latest.generated_at,
  window: {
    start,
    end: latest.window?.end ?? latest.generated_at,
    timezone: "UTC",
    duration_hours: Math.round((Date.parse(latest.window?.end ?? latest.generated_at) - Date.parse(start)) / 36e5),
  },
  // The newest run's own account of itself, and of the sources it used.
  scope: latest.scope,
  digest: [...entries.entries()].map(([id, e]) => ({ ...e, items: bySource.get(id) })),
  /** The newest run's posts — what a page load counts as newly shown. */
  latest: (latest.digest ?? []).flatMap((e) => (e.items ?? []).map((i) => ({ url: i.url, source_id: idOf(e) }))),
  runs: kept.map((r) => r.generated_at),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(
  `digest: ${runs.length} run(s), ${kept.length} within ${KEEP_DAYS} days → ${items.size} posts from ${
    [...bySource.values()].filter((v) => v.length).length
  } sources`,
);
