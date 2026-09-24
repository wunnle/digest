import "server-only";
import { Redis } from "@upstash/redis";

/**
 * Created on first use rather than at import, so the static build never needs
 * the store's credentials. Accepts both env var names: the Vercel Marketplace
 * integration sets the `KV_REST_API_*` pair, a plain Upstash database the
 * `UPSTASH_REDIS_REST_*` pair.
 */
let client: Redis | null = null;

export function redis() {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Upstash Redis credentials are not set");
  client = new Redis({ url, token });
  return client;
}
