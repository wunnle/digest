import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import payload from "../../../../digest-data.json";
import { redis } from "@/server/redis";
import { readSession } from "@/server/session";
import { parseDoc, sourceId, type Source, type SourcesDoc } from "@/sources";

/**
 * The source list, as one JSON document in Redis. No TTL — unlike marks, this
 * is configuration, not something to forget.
 *
 * GET is the scraping agent's read endpoint (Bearer $AGENT_TOKEN) as well as
 * the editor's; PUT is the editor's alone.
 */

const KEY = "digest:sources";
const noStore = { "cache-control": "no-store" };

/** Compared as digests so the lengths always match, in constant time. */
function isAgent(req: NextRequest) {
  const expected = process.env.AGENT_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  if (!expected || !header.startsWith("Bearer ")) return false;
  const a = createHash("sha256").update(header.slice(7)).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Until the list is first saved, it's whatever the last run used — read off
 * the payload it wrote — so the first run after this ships sees no change.
 */
function seed(): SourcesDoc {
  const scope = payload.scope as { accounts?: string[]; sources?: Source[] };
  const addedAt = payload.generated_at;
  const sources: Source[] =
    scope.sources ??
    (scope.accounts ?? []).map((handle) => ({
      id: sourceId("x", handle),
      type: "x" as const,
      target: handle,
      label: payload.digest.find((d) => d.handle === handle)?.name,
      enabled: true,
      addedAt,
    }));
  return parseDoc({ windowHours: payload.window.duration_hours, sources }, addedAt);
}

export async function GET(req: NextRequest) {
  if (!isAgent(req) && !(await readSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }
  const stored = await redis().get<SourcesDoc>(KEY);
  // Re-parsed on the way out, so fields since dropped from the shape (notes,
  // the filter) never reach the agent even if an older save still holds them.
  const doc = stored ? parseDoc(stored, stored.updatedAt) : seed();
  return NextResponse.json(doc, { headers: noStore });
}

export async function PUT(req: NextRequest) {
  // Session only: the agent reads the list, it never rewrites it.
  if (!(await readSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let doc: SourcesDoc;
  try {
    doc = parseDoc(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  await redis().set(KEY, doc);
  return NextResponse.json(doc, { headers: noStore });
}
