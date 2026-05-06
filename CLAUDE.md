# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Scrapify is a **two-process** application: a Next.js 14 (App Router) frontend and a standalone Fastify backend. They run independently and communicate via HTTP.

```
Browser ── Next.js (3000) ─proxy─▶ Fastify backend (8787) ─▶ Postgres + Redis
                                                              (PGlite + ioredis-mock by default)
```

### Frontend (`app/`, `components/`, `lib/`, `hooks/`)

- Next.js 14 App Router, TypeScript strict mode, Tailwind. Path alias `@/*` → repo root.
- Product is a **conversational collector** (post 2026-05-05 rewrite). Only four pages remain: `/` (Composer landing), `/c/[id]` (conversation detail), `/records`, `/me`. Older "SaaS console" pages (tasks/schedule/fields/analytics/monitor/proxy) were deleted — do not assume they exist; `scrapify-dev-spec.md` and the "已完成历史" section of `scrapify-progress.md` describe that obsolete shape.
- `app/api/*` is **only a thin proxy layer**. It forwards to the Fastify backend via `lib/server/backend.ts` using `SCRAPIFY_BACKEND_BASE_URL`. There is **no fallback to mock data** — if the backend isn't running, frontend API routes return 503. Only `tasks` and `fields` proxies still exist.
- Conversation history & user prefs live in `localStorage` via `lib/preferences.ts` (no server-side user model yet).
- TanStack Query (`hooks/useTasks.ts`, `hooks/useTasksByIds.ts`) polls `/api/tasks` to drive progress UI. Zustand stores in `lib/store/` are mostly UI state.

### Backend (`backend/src/`)

- Entry: `backend/src/server.ts` → `initDb()` → `loadDatabase()` → `startTaskWorker()` → register routes (`health`, `tasks`, `fields`). The task worker is started inside the API process — there's no separate worker binary.
- **Dual-driver DB client** (`backend/src/db/client.ts`):
  - `DATABASE_URL=pglite://./.dev-pg-data` (default) → embedded PGlite, persists to `.dev-pg-data/`. PGlite migrations are auto-applied on boot. Stale `postmaster.pid` is auto-removed at startup so a hard-killed dev server doesn't brick the next launch.
  - `DATABASE_URL=postgres://...` → real Postgres via `pg` + `drizzle-orm/node-postgres`. Migrations must be applied manually with `npm run db:migrate`.
  - `REDIS_URL=mock://` (default) → `ioredis-mock`; `redis://...` → real Redis. Used by `@fastify/rate-limit`.
- **Schema is intentionally minimal** (`backend/src/db/schema.ts`): `users` (placeholder, Phase 1), `tasks`, `field_configs`. The full `TaskRuntimeRecord` (logs, runHistory, result preview, failure details, etc.) is stored as JSONB in `tasks.payload` — not normalized into separate tables.
- **In-memory state pattern** (`services/data-store.ts`): the backend keeps a single `state: DatabaseShape` in process memory. Reads return that object; mutations are made in place by routes/worker, then `saveDatabase()` flushes the whole snapshot to PG inside a transaction. Concurrent saves coalesce (in-flight + pending flag) to avoid N×truncate-insert from heartbeat ticks.
- **Task runtime** (`services/task-runtime.ts`, ~1200 lines): the actual scraper. The pipeline tries four sources in order: `shopify-products-json` → `woocommerce-store-api` → `sitemap-html` → `html-structured-data` (JSON-LD / `__NEXT_DATA__`). Worker tick is 3s, max 2 concurrent tasks per process. All status/progress/log changes go through helpers in this file — don't mutate `TaskRuntimeRecord` directly from routes.
- **Type duplication is intentional**: `lib/types/index.ts` (frontend) and `backend/src/types.ts` (backend) are kept structurally identical. When changing the API contract, update both.
- **CSV export** (`routes/tasks.ts`): the `/api/tasks/:id/export?format=csv` endpoint emits Shopify Admin Export's exact 57-column template. The column list and ordering are fixed by Shopify and must not be reordered. Multi-image products produce extra rows containing only `Handle` + `Image Src` + `Image Position`.

## Commands

### Day-to-day

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js on port 3000. `predev` hook auto-cleans `.next` and aborts if 3000 is occupied. Does **not** start the backend. |
| `npm run dev:restart` | Force-kill any `node.exe` listening on 3000 (Windows only — uses `netstat`/`taskkill`), wait for the port, clean `.next`, then start `next dev`. |
| `npm run dev:stop` | Same kill-on-port logic without restarting. |
| `npm run backend:dev` | Compile `backend/` with `tsc` then run `backend/dist/server.js`. There is no `tsx`-watch script — re-run this to pick up changes. |
| `npm run backend:check` | Type-check the backend without emitting. Use this as the backend's lint pass. |
| `npm run build` / `npm start` | Production Next build / start. |
| `npm run lint` | `next lint` (eslint with `next/core-web-vitals`). Backend is not covered by ESLint. |

### Database

| Command | What it does |
|---|---|
| `npm run db:generate` | Generate a new Drizzle migration in `backend/src/db/migrations/` after editing `schema.ts`. |
| `npm run db:migrate` | Apply migrations to whatever `DATABASE_URL` points at. **Only needed for real Postgres** — PGlite auto-migrates on boot. |
| `npm run db:studio` | Open Drizzle Studio against `DATABASE_URL`. |
| `npm run db:reset` | Delete the `.dev-pg-data/` directory (wipe PGlite). |
| `npm run db:migrate-from-json` | One-off migration script (`backend/scripts/migrate-from-json.ts`) that imports the legacy `backend/data/db.json` into PG. |

### Infrastructure (only when switching off PGlite/mock)

- `npm run infra:up` / `npm run infra:down` — start/stop the Postgres + Redis containers in `docker-compose.dev.yml`. After bringing them up, set `DATABASE_URL=postgres://scrapify:scrapify_dev@localhost:5432/scrapify` and `REDIS_URL=redis://localhost:6379` in `.env`, then `npm run db:migrate`.

### Running a single test

There is currently no test framework wired up. Don't add `npm test` references unless tests are added.

## Local environment

- `.env.example` is the canonical list. Defaults are tuned for **zero-dependency dev**: PGlite + ioredis-mock + frontend pointing at `localhost:8787`. You generally don't need to edit `.env` to develop.
- `BACKEND_DATA_FILE` and `backend/data/db.json` are legacy from the JSON-file persistence phase; current code only uses them via `migrate-from-json`. Persistence is PG-only at runtime.

## Conventions specific to this repo

- **Comments and progress notes are written in Chinese.** Match the surrounding language when adding comments. User-facing UI strings are also Chinese.
- **`scrapify-progress.md` is a living journal**, not a spec. It uses `~~strikethrough~~` for completed items. When a meaningful change is made, append a new dated entry to the top of "开发记录"; do not retroactively edit older entries. The file already contains accurate "what is currently live vs. what was deleted" status — consult it before assuming a feature exists.
- **Spec files** (`scrapify-dev-spec.md`, `scrapify-backend-spec.md`, `scrapify-launch-spec.md`) describe the original vision. They are partially obsolete after the conversation-UI rewrite — treat them as historical context, not requirements.
- The dev-server helpers in `scripts/dev-server-utils.mjs` are **Windows-only** (they shell out to `netstat`/`taskkill`/`tasklist`). On non-Windows, use `next dev` directly instead of `dev:restart`/`dev:stop`.
- `backend/dist/` is checked-in build output that `backend:dev` rebuilds; treat it as generated.
