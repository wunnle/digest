import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { loadSources, saveSources } from "@/server/sources";
import { readSession } from "@/server/session";
import { parseDoc, type SourcesDoc } from "@/sources";

/**
 * The source list (see `src/server/sources.ts`). GET is the scraping agent's
 * read endpoint (Bearer $AGENT_TOKEN) as well as the editor's; PUT is the
 * editor's alone.
 */

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

export async function GET(req: NextRequest) {
  if (!isAgent(req) && !(await readSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }
  return NextResponse.json(await loadSources(), { headers: noStore });
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
  await saveSources(doc);
  return NextResponse.json(doc, { headers: noStore });
}
