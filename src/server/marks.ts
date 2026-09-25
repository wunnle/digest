import "server-only";

/** Redis keys for a user's marks and what /insights derives from them. */
export const KINDS = ["read", "liked"] as const;
export type Kind = (typeof KINDS)[number];

export const markKey = (sub: string, kind: Kind) => `digest:${sub}:${kind}`;
/** url → LikeMeta, for every liked post. */
export const likedMetaKey = (sub: string) => `digest:${sub}:liked:meta`;
/** run id → RunCounts, for every run this user opened. */
export const runsKey = (sub: string) => `digest:${sub}:runs`;
