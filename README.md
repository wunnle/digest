# digest

A static page of AI-dev posts, built entirely from the agent's run files in `runs/`.

**How it's fed:** you manage the source list at `/sources` (X, Bluesky, RSS, YouTube, HN or any web page). An agent fetches that list at the start of each run, collects the posts, adds a new `runs/<timestamp>.json` and pushes it, and the push deploys. Runs are append-only. The agent's instructions are in [AGENT.md](AGENT.md).

Read marks and likes are the only per-user state. They live in Upstash Redis behind a Google sign-in limited to an email allowlist. Signed out, the page is fully readable with marking switched off.

## Layout

- `runs/*.json`: one file per agent run, append-only. They're the only content source.
- `scripts/build-digest.mjs`: runs before `dev` and `build`. It checks every run, failing the build on malformed data or X page clutter in post text, then merges the last 30 days, de-duplicated by URL (newest run wins), into `src/generated/digest.json`, which is gitignored and is what the page reads.
- `src/app/data.ts`: reshapes the payload, adding nothing.
- `src/app/page.tsx`, `src/app/ui.tsx`: the page, cards, lightbox and `useMarks()`.
- `src/app/api/auth/{login,callback,logout}`: the Google OAuth code flow and a stateless JWT session cookie.
- `src/app/api/marks`: `GET` / `POST` / `DELETE` for read and like marks.
- `src/app/sources`, `src/app/api/sources`: the source list editor, and its API. `GET` accepts a session or `Authorization: Bearer $AGENT_TOKEN`; `PUT` needs a session.
- `src/sources.ts`: the source list's types and validation, shared by the API and the editor.
- `src/app/insights`, `src/app/api/insights`: likes per source against posts shown, for deciding which sources to cut.
- `src/server/`: the session and Redis helpers (server-only).

## Sources

The list is one JSON document in Redis under `digest:sources`, with no expiry. Until it's first saved, `/api/sources` serves the list the newest run used. Each run also copies the list it used into `scope.sources`, so git history keeps a copy of it.

## Retention

Each user has one sorted set per kind, `digest:{sub}:read` and `digest:{sub}:liked`. The member is the post URL; the score is when it was marked.

- **Read marks** older than 30 days are trimmed on every read, and a key untouched for 30 days expires. No cron job.
- **Likes** are kept for good; they feed `/insights`. Each like also records its source in `digest:{sub}:liked:meta`, looked up server-side from the deploy's payload, since the next run replaces it.
- **Shown posts:** on each signed-in page load, `digest:{sub}:shown` records the newest run's posts (url → source). Each post counts once however many runs repeat it. Those are the "posts shown" that likes are measured against.

## Setup

1. **Google OAuth client** (Google Cloud Console → APIs & Services → Credentials → OAuth client ID → Web). Add these authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback`
   - `https://<prod-domain>/api/auth/callback`

   Preview deployments can't sign in, because Google doesn't accept wildcard redirect URIs.
2. **Upstash Redis**: add it from the Vercel Marketplace and link it to the project. That sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
3. **Env vars** in Vercel: see `.env.example`. `AGENT_TOKEN` goes to the scraping agent too.
4. Pull them locally:

   ```bash
   vercel env pull .env.local
   ```

The build needs none of these. Only the API routes read them, at request time.
