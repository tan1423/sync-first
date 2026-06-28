# Collab Editor — Architecture & Build Plan

> **Local-First, Collaborative Document Editor** with offline sync, deterministic
> (CRDT) conflict resolution, and granular version control.
> House of Edtech — Fullstack Assignment 2 (v2.1).

---

## 1. Why these choices map to the rubric

The assignment is explicitly **not CRUD**. The graded core is the **offline-sync
engine** and **deterministic conflict resolution with no data loss**. Every tech
choice below is justified against that.

| Requirement (from brief) | How we satisfy it | Tech |
|---|---|---|
| Local-first, zero blocking network on open/edit/close | IndexedDB is the source of truth; UI never awaits the network | `y-indexeddb` |
| Deterministic conflict resolution, no data loss | CRDT — merges are commutative/associative/idempotent by construction | **Yjs** |
| Background sync engine (push + pull, never destroy offline work) | Yjs sync protocol exchanges *state vectors*; offline edits buffer in the doc and flush on reconnect | `y-websocket` |
| Real-time communication protocol | WebSocket sync server (standalone Node service) | `ws` + `y-websocket` |
| Version history / time travel without corrupting live state | Immutable `Y.encodeStateAsUpdate` snapshots; **restore = new merged update**, never a hard overwrite | `versions` table |
| Roles: Owner / Editor / Viewer; viewers cannot push | JWT verified at WS handshake; viewer connections are read-only — server drops their `sync`/`update` messages | NextAuth + WS auth hook |
| Reject malformed/huge payloads (OOM) | Per-message byte cap, message-rate cap, Zod schema on REST sync routes | `zod`, ws `maxPayload` |
| Tenant isolation | Every query scoped by `documentId` + membership check (strict ODM scoping; MongoDB has no RLS) | Mongoose + guard layer |
| AI add-on | Summarize / continue-writing / fix-grammar on selection | AI SDK (provider chosen later) |

### Why Yjs over OT or a hand-rolled merge
A CRDT gives **mathematically guaranteed convergence**: any two replicas that have
seen the same set of updates reach byte-identical state, regardless of order or
network partition. That is exactly "deterministic conflict resolution without data
loss." A hand-rolled OT engine could score "intellect" points but carries a high
risk of subtle data-loss bugs — the rubric punishes data loss directly. We instead
*demonstrate the systems thinking* in the sync engine, version model, and security
layer.

---

## 2. System topology

```
┌─────────────────────────── Browser (per user) ───────────────────────────┐
│  React / Next.js 16 UI                                                     │
│    └─ Tiptap editor  ◄──►  Y.Doc (in-memory CRDT)                          │
│                              │  ▲                                          │
│              y-indexeddb ◄───┘  │  (local-first persistence = source of    │
│              (survives reload /  │   truth, instant open, offline edits)    │
│               offline)           │                                         │
│                                  ▼                                         │
│                         y-websocket provider  ── connection status UI      │
└───────────────────────────────────│───────────────────────────────────────┘
                                     │  WebSocket (JWT in handshake)
                     ┌───────────────▼────────────────┐
                     │  Sync server (Node, /server)    │
                     │   • verify JWT → {userId, role} │
                     │   • viewer = read-only           │
                     │   • maxPayload + rate guard      │
                     │   • debounced persist to PG      │
                     └───────────────│────────────────┘
                                     │
                     ┌───────────────▼────────────────┐
                     │  Next.js API routes (REST)      │
                     │   • auth, membership, versions  │
                     │   • Zod-validated sync fallback │
                     └───────────────│────────────────┘
                                     ▼
                     ┌────────────────────────────────┐
                     │  MongoDB (Mongoose)             │
                     │   users, documents, members,    │
                     │   doc_state, versions           │
                     └────────────────────────────────┘
```

---

## 3. Data model (Mongoose collections — see `lib/models.ts`)

```
User      { _id, email (unique), name, passwordHash, createdAt }
Document  { _id, title, createdAt, updatedAt }
Member    { _id, documentId→Document, userId→User, role (OWNER|EDITOR|VIEWER),
            unique(documentId, userId) }
DocState  { _id, documentId (unique), update Buffer, stateVector Buffer, updatedAt }  // merged Yjs state
Version   { _id, documentId, label, snapshot Buffer, createdById→User, createdAt }    // immutable snapshots
```

- **DocState** stores the merged Yjs update so the server can re-hydrate a doc and
  serve late joiners. It is overwritten only by *merging* new updates into it.
- **Version** rows are **append-only**. Restoring loads a snapshot and applies it as
  a *new* update on top of current state → other collaborators converge, nobody's
  live work is destroyed.

---

## 4. The sync protocol (the heart of the project)

1. **Open** — UI mounts, creates `Y.Doc`, attaches `y-indexeddb`. The doc paints
   from IndexedDB **synchronously-fast**; no network is awaited. (Local-first.)
2. **Connect** — `y-websocket` opens with the JWT. Server verifies, resolves role,
   loads `DocState` for that doc.
3. **Reconcile** — Yjs sync step 1/2 exchanges state vectors; each side sends only
   the updates the other lacks. Offline edits made in step 1 are part of the local
   doc and are pushed here — **never overwritten**, because CRDT merge is a union.
4. **Live** — subsequent edits broadcast as incremental updates to all peers.
5. **Persist** — server debounces (~2s) and writes the merged update to `DocState`.
6. **Snapshot** — user (or autosave) captures a `Version` from current state.

### Offline → online race handling
Because state is a CRDT, the classic "two clients edited the same paragraph while
offline" case merges deterministically — there is no last-write-wins clobber. The
*queue* the brief asks for is the Yjs update buffer (in-memory + IndexedDB-backed);
we surface it via an explicit **connection/sync status indicator** (`offline`,
`connecting`, `syncing`, `synced`).

---

## 5. Security / abuse mitigation (Must-Have)

- **OOM / huge payload:** `ws` `maxPayload` byte cap rejects oversized frames before
  buffering; per-connection message-rate limiter; Zod `.max()` length caps on all
  REST sync bodies; reject updates that don't parse as valid Yjs.
- **Authz:** WS handshake verifies JWT → membership row → role. `VIEWER` sockets are
  flagged read-only; inbound `sync`/`update` messages from them are dropped server-side.
- **Tenant isolation:** every DB access goes through a guard that requires a Member
  row for `(userId, documentId)`; no cross-document data is ever returned. (Strict
  ODM scoping standing in for Row-Level Security, which MongoDB lacks.)
- **Input validation:** Zod schemas on every API route; reject unknown fields.

---

## 6. File structure (target)

```
collab-editor/
├─ app/
│  ├─ (auth)/login, /register
│  ├─ dashboard/                 # list of my documents
│  ├─ doc/[id]/                  # the editor
│  └─ api/                       # auth, documents, members, versions
├─ components/                   # editor, toolbar, status badge, version panel, footer
├─ lib/
│  ├─ db.ts                      # Mongoose connection (cached)
│  ├─ models.ts                  # Mongoose schemas
│  ├─ auth.ts / jwt.ts           # JWT sign/verify, session cookie
│  ├─ collab/                    # useCollab hook, merge, snapshots
│  ├─ guards.ts                  # membership/role checks
│  └─ validation.ts              # Zod schemas
├─ server/sync-server.ts         # standalone WebSocket sync server
└─ __tests__/                    # sync-engine + validation unit tests
```

---

## 7. Milestones

1. ✅ Scaffold Next 16 + TS + Tailwind, this doc
2. MongoDB + Mongoose models
3. Auth (register/login, JWT) + roles
4. Editor (Tiptap + Yjs + y-indexeddb) — local-first, works fully offline
5. WS sync server with auth + viewer read-only + payload guards
6. Version history + time-travel restore
7. Connection-status UI, AI add-on, accessible footer
8. Tests (sync engine unit + e2e), CI/CD, deploy

---

## 8. Real-world considerations (rubric: "document state size over time")

- Yjs updates accumulate; we periodically **compact** by storing a single merged
  `encodeStateAsUpdate` in `DocState` instead of an append log.
- Old `Version` snapshots can be pruned/archived by retention policy.
- Garbage collection of deleted CRDT content is enabled on the server doc.
```
