# digest

A static page of AI-dev posts, built entirely from `digest-data.json`.

**How it's fed:** you manage the source list at `/sources` (X, Bluesky, RSS, YouTube, HN or any web page). An agent fetches that list at the start of each run, collects the posts, overwrites `digest-data.json` and pushes it, and the push deploys. The agent's instructions are in [AGENT.md](AGENT.md).

Read marks and likes are the only per-user state. They live in Upstash Redis behind a Google sign-in limited to an email allowlist. Signed out, the page is fully readable with marking switched off.

## Layout

- `digest-data.json`: the payload. It's the only content source.
- `src/app/data.ts`: reshapes the payload, adding nothing.
- `src/app/page.tsx`, `src/app/ui.tsx`: the page, cards, lightbox and `useMarks()`.
- `src/app/api/auth/{login,callback,logout}`: the Google OAuth code flow and a stateless JWT session cookie.
- `src/app/api/marks`: `GET` / `POST` / `DELETE` for read and like marks.
- `src/app/sources`, `src/app/api/sources`: the source list editor, and its API. `GET` accepts a session or `Authorization: Bearer $AGENT_TOKEN`; `PUT` needs a session.
- `src/sources.ts`: the source list's types and validation, shared by the API and the editor.
- `src/server/`: the session and Redis helpers (server-only).

## Sources

The list is one JSON document in Redis under `digest:sources`, with no expiry. Until it's first saved, `/api/sources` serves the list the last run used, read from `digest-data.json`. Each run also copies the list it used into `scope.sources`, so git history keeps a copy of it.

## Retention

Each user has one sorted set per kind, `digest:{sub}:read` and `digest:{sub}:liked`. The member is the post URL; the score is when it was marked. Marks older than 30 days are trimmed on every read, and a key untouched for 30 days expires. No cron job.

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
