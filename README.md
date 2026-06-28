# SyncScribe — Local-First Collaborative Document Editor

A local-first, real-time collaborative document editor with **offline
synchronization**, **deterministic (CRDT) conflict resolution**, and **granular
version control**. Built for the House of Edtech Fullstack Assignment 2.

> Open, edit, and close documents with **zero network requests blocking the UI**.
> Go offline, keep typing, and on reconnect your work is **merged — never
> overwritten** — with concurrent edits from other collaborators.

**Live demo:** _add your Vercel URL here_
**Architecture deep-dive:** see [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## ✨ Features

- **Local-first** — IndexedDB is the source of truth (`y-indexeddb`); the editor
  paints instantly and works fully offline.
- **Deterministic conflict resolution** — Yjs CRDT guarantees all replicas
  converge to identical state regardless of edit order, with no data loss.
- **Background sync engine** — a custom WebSocket server reconciles local and
  remote state via the Yjs sync protocol; offline edits buffer and flush on
  reconnect.
- **Version history & time travel** — capture immutable snapshots and restore
  any of them safely; restores propagate through the CRDT so live collaborators
  converge without corruption.
- **Roles** — Owner / Editor / Viewer. **Viewers cannot push updates** (enforced
  server-side at the WebSocket layer).
- **Security** — JWT auth (shared by HTTP + WebSocket), strict Zod validation,
  WebSocket `maxPayload` + rate limiting (OOM protection), and strict ORM
  scoping for tenant isolation.
- **AI add-ons** — summarize, continue writing, fix grammar, improve tone.
- **Accessible UI** — keyboard-navigable toolbar, ARIA roles, live status
  region, responsive layout, dark mode.

## 🧱 Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) + TypeScript + React 19 |
| Styling | Tailwind CSS v4 + `@tailwindcss/typography` |
| Editor | Tiptap v3 (ProseMirror) + `y-prosemirror` |
| CRDT / sync | Yjs, `y-indexeddb`, `y-websocket`, `y-protocols` |
| Realtime server | Standalone Node WebSocket server (`ws`) |
| Database | **MongoDB** via Mongoose ODM |
| Auth | JWT (`jose`) + bcrypt, httpOnly cookies |
| Validation | Zod |
| Tests | Vitest |

> **Note on the database.** The assignment lists PostgreSQL under *Mandatory
> Skills* but the Technology-Stack section explicitly permits
> "PostgreSQL, MySQL, **MongoDB**". This project uses MongoDB (via Mongoose) per
> that clause. Since MongoDB has no Row-Level Security, tenant isolation is
> enforced by **strict ODM scoping** (every document access is gated by a
> membership check in [`lib/guards.ts`](./lib/guards.ts)) — the alternative the
> brief allows. Works with a standalone local `mongod` or MongoDB Atlas.

## 🚀 Getting started

### 1. Prerequisites
- Node.js 22+
- MongoDB — either a local `mongod` (`mongodb://localhost:27017/collab_editor`)
  or a free **MongoDB Atlas** cluster. No replica set required.

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and set `DATABASE_URL` (local Mongo or your Atlas `mongodb+srv://…`
string, including the `/collab_editor` database name). Generate a strong
`JWT_SECRET`:
```bash
openssl rand -base64 48
```

### 3. Install
```bash
npm install
```
No migration step needed — Mongoose creates collections and builds the indexes
defined in [`lib/models.ts`](./lib/models.ts) on first connect.

### 4. Run (Next.js app + WebSocket sync server together)
```bash
npm run dev
```
- App: http://localhost:3000
- Sync server: ws://localhost:4444

Open the app in two browsers (or an incognito window), share a document, and
edit simultaneously. Toggle your network offline in DevTools to see local-first
sync and conflict-free merge on reconnect.

## 🧪 Testing
```bash
npm test
```
Unit tests focus on the sync engine: CRDT convergence/idempotency (deterministic
conflict resolution), version-restore deltas, and the validation/authorization
guards. See [`__tests__/`](./__tests__).

## 📦 Scripts
| Script | Purpose |
|---|---|
| `npm run dev` | App + sync server (concurrently) |
| `npm run dev:next` / `dev:sync` | Run each separately |
| `npm run build` | Production build |
| `npm test` | Vitest |

## ☁️ Deployment

- **App → Vercel.** Set `DATABASE_URL`, `JWT_SECRET`, and
  `NEXT_PUBLIC_SYNC_URL` (your deployed sync server's `wss://` URL) as project
  env vars. CI runs via [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).
- **Sync server → Railway / Render / Fly.** Vercel's serverless functions can't
  hold persistent WebSocket connections, so the sync server deploys separately.
  Run it with `npm run sync` (start command), and give it the same `DATABASE_URL`
  and `JWT_SECRET`. Use `wss://` in production and set the auth cookie
  `SameSite=None; Secure` if the sync server is on a different domain (the app
  already falls back to a short-lived `?token=` for that case).

## 🔐 Security notes (assignment "Must Have")
- **OOM / malformed payloads:** `ws` `maxPayload` rejects oversized frames before
  buffering; a per-connection message-rate limiter caps abuse; every REST body is
  Zod-validated with hard `.max()` length caps; non-parseable Yjs updates are
  rejected before persistence.
- **AuthN/AuthZ:** every socket and API route requires a valid JWT; document
  access requires a membership row; viewers' inbound document updates are dropped
  server-side.
- **Tenant isolation:** strict ORM scoping in [`lib/guards.ts`](./lib/guards.ts).

---

Built by **Tanish Mangal** · [GitHub](https://github.com/tan1423) · [LinkedIn](https://www.linkedin.com/in/tanish-mangal-1b27a521b/)
