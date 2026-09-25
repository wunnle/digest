/** The /api/insights response, shared by the route and the page. */

export type InsightRow = {
  id: string;
  /** What the chart shows: @handle, a site's host, or "HN". */
  label: string;
  /** Secondary: the source's display name, when it has one. */
  name?: string;
  type: string;
  likes: number;
  posts: number;
  /** likes ÷ posts, or null with no posts on record. */
  rate: number | null;
  lastLikedAt: string | null;
  /** Still in the source list, and whether it's switched on there. */
  inList: boolean;
  enabled: boolean;
};

export type Insights = {
  rows: InsightRow[];
  totalLikes: number;
  totalPosts: number;
  runs: number;
  since: string | null;
};
