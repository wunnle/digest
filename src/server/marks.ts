import "server-only";

/** Redis keys for a user's marks and what /insights derives from them. */
export const KINDS = ["read", "liked"] as const;
export type Kind = (typeof KINDS)[number];

export const markKey = (sub: string, kind: Kind) => `digest:${sub}:${kind}`;
/** url → LikeMeta, for every liked post. */
export const likedMetaKey = (sub: string) => `digest:${sub}:liked:meta`;
/** url → source id, for every post a page load put in front of this user. */
export const shownKey = (sub: string) => `digest:${sub}:shown`;
/** url → Bookmark: a snapshot of every bookmarked post, kept for good. */
export const bookmarksKey = (sub: string) => `digest:${sub}:bookmarks`;
/** When shown posts started being recorded — the start of /insights' range. */
export const shownSinceKey = (sub: string) => `digest:${sub}:shown:since`;
