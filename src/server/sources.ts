import "server-only";
import payload from "../generated/digest.json";
import { redis } from "@/server/redis";
import { parseDoc, sourceId, type Source, type SourcesDoc } from "@/sources";

/**
 * The source list, as one JSON document in Redis. No TTL — unlike read marks,
 * this is configuration, not something to forget.
 */
export const SOURCES_KEY = "digest:sources";

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
  return parseDoc({ sources }, addedAt);
}

export async function loadSources(): Promise<SourcesDoc> {
  const stored = await redis().get<SourcesDoc>(SOURCES_KEY);
  // Re-parsed on the way out, so fields since dropped from the shape (notes,
  // the filter) never reach the agent even if an older save still holds them.
  return stored ? parseDoc(stored, stored.updatedAt) : seed();
}

export async function saveSources(doc: SourcesDoc) {
  await redis().set(SOURCES_KEY, doc);
}
