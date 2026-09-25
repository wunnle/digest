# Digest agent: how a run works

You build the digest. Each run has four steps: fetch the source list, collect posts from each source, write `digest-data.json`, and push it. The push deploys the site; there's no other step.

## 1. Fetch the sources

```bash
curl -s -H "Authorization: Bearer $AGENT_TOKEN" https://<domain>/api/sources
```

The response looks like this:

```json
{
  "version": 1,
  "updatedAt": "2026-09-25T09:12:00.000Z",
  "filter": "AI and software-development posts with concrete tools, workflows, evidence, experiments, or useful criticism",
  "windowHours": 48,
  "sources": [
    { "id": "x:simonw", "type": "x", "target": "simonw", "label": "Simon Willison", "enabled": true, "addedAt": "…" },
    { "id": "rss:https://simonwillison.net/atom/everything/", "type": "rss", "target": "https://simonwillison.net/atom/everything/", "note": "only long-form entries", "enabled": true, "addedAt": "…" }
  ]
}
```

- Skip sources with `"enabled": false`.
- `filter` applies to every source. A source's `note`, if it has one, adds to it for that source only.
- The window is the `windowHours` before the time you start the run, in UTC.

## 2. Collect, per type

| `type`    | `target`                    | Where to look |
|-----------|-----------------------------|---------------|
| `x`       | handle, no `@`              | Public profile timeline. Include quoted posts as `quote_tweet`. |
| `bluesky` | handle (`name.bsky.social`) | The author's feed via `public.api.bsky.app` (`app.bsky.feed.getAuthorFeed`). |
| `rss`     | feed URL                    | Feed entries published in the window. |
| `youtube` | channel handle, no `@`      | Channel uploads (the channel's RSS feed works). |
| `hn`      | `front`, or a search query  | Front-page stories, or Algolia search (`hn.algolia.com/api/v1/search_by_date`). |
| `web`     | page URL                    | The newest entries listed on that page (a blog index, a changelog). |

Keep only what passes the filter. It's fine for a source to contribute nothing. Still give it an entry, with a `note` saying why if the reason isn't just "nothing relevant".

## 3. Write `digest-data.json`

Overwrite the file at the repo root. Top-level shape:

```jsonc
{
  "generated_at": "2026-09-25T04:00:00Z",
  "window": { "start": "…Z", "end": "…Z", "timezone": "UTC", "duration_hours": 48 },
  "scope": {
    "sources": [ /* the enabled sources you were given, as-is */ ],
    "filter": "…the filter you applied…",
    "source": "one line on where posts came from",
    "note": "optional caveats about this run"
  },
  "digest": [ /* one entry per source, in the order of scope.sources */ ]
}
```

One entry per source:

```jsonc
{
  "source_id": "x:simonw",         // the source's id, exactly
  "type": "x",
  "handle": "simonw",              // social types only; used as the filter chip
  "name": "Simon Willison",        // author or site name, shown on each card
  "note": "optional: why this source is empty",
  "items": [
    {
      "published_at": "2026-09-24T00:22:10Z",
      "url": "https://x.com/simonw/status/…",   // must be https; it identifies the item
      "topic": "a few words on what it's about",
      "title": "Headline, for rss/youtube/hn/web — omit for posts",
      "text": "The post as written, newlines kept. For articles: a short summary.",
      "media": [
        { "type": "photo", "url": "https://…", "width": 1200, "height": 800 },
        { "type": "video", "url": "https://….mp4", "thumbnail_url": "https://….jpg", "width": 1280, "height": 720, "duration": 42.5 }
      ],
      "quote_tweet": null            // x only, same shape as before
    }
  ]
}
```

Rules:
- Every `url` must be `https://` and unique across the file.
- Leave out `title` for social posts. Include it for everything else.
- `media` needs real `width` and `height`. Omit the whole field if there's no media.
- Items don't need to be sorted; the page sorts newest-first.

## 4. Publish

Commit only `digest-data.json` to `main` and push. Vercel builds and deploys on the push. Don't touch other files.

```bash
git add digest-data.json
git commit -m "Digest $(date -u +%Y-%m-%d)"
git push
```
