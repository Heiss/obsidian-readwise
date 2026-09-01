# Obsidian ↔ Readwise Reader Plugin — Requirements / Spec

_As of: 2026-09-01 · **Status: v0.1 — proposed, decisions R1–R9 drafted** · not yet built_

> **What this is:** a port of [obsidian-linkwarden](https://github.com/Heiss/obsidian-linkwarden)
> to the [Readwise Reader API](https://readwise.io/reader_api), keeping the same
> UX and the same architecture, but reduced to a **single setup step**: paste a
> Readwise access token and you are ready to go.

## Core idea (unchanged from Linkwarden)

Show highlights from Readwise Reader as a **living reading aid** next to the
active note — rather than materializing them as files. No sync of *notes*, no
merge/clobber problem. Guiding principle: **read in Reader, write in Obsidian.**
Materializing a highlight happens only deliberately and opt-in (F4).

The binding is still the whole design: a note is bound to a Reader document by a
single Markdown link whose href is the document's own Reader URL
(`https://read.readwise.io/read/<id>`). **The id in the href IS the binding** —
single source of truth, no separate id field, no URL normalization.

## The UX target

1. Readwise → <https://readwise.io/access_token> → copy token.
2. Obsidian → **Settings → Readwise Reader** → paste token (stored in Obsidian's
   OS-backed `SecretStorage`, never in the synced vault).
3. Done. No base URL, no instance, no collection prerequisites, no server-side
   flags to enable.

This is strictly *less* setup than the Linkwarden plugin, which also needed a
base URL and a `preventDuplicateLinks` instance setting. Both disappear here.

## API reality check — what changes versus Linkwarden

The Reader API is materially different from Linkwarden's in four ways that shape
the whole port. Everything else is a rename.

| Aspect | Linkwarden | Readwise Reader | Consequence for the port |
| --- | --- | --- | --- |
| Host | self-hosted or cloud → `baseUrl` setting | one hosted service, `https://readwise.io/api` | **`baseUrl` setting is deleted** (an `apiBase` stays in the settings *type* only, for the mock server) |
| Auth header | `Authorization: Bearer <token>` | `Authorization: Token <token>` | one line in the client; token page is `https://readwise.io/access_token` |
| Token probe | `GET /api/v1/collections` | `GET /api/v2/auth/` → `204 No Content` | simpler, cheaper connection test |
| Id type | integer PK | ULID string, 26 chars, e.g. `01gnpwjqm3v0dhtqnj7v3qtn5r` | ids become **strings** everywhere: parse, cache keys, block ids |
| Deep link | `<base>/links/<id>`, 3 configurable targets | `https://read.readwise.io/read/<id>` — which *is* the document's own `url` field | **deep-link-target setting is deleted**; the binding href is just `document.url` |
| Search | server-side `GET /api/v1/search?searchQueryString=` | **none.** `/v3/list/` filters only by `id`, `updatedAfter`, `location`, `category`, `tag` | a **local document index** is required (F7) |
| Highlights per source | `GET /api/v1/links/{id}/highlights` | **no per-parent endpoint.** Highlights are themselves documents (`category=highlight`) whose `parent_id` is the article; notes are documents (`category=note`) whose `parent_id` is the *highlight* | a **local highlight index** grouped by `parent_id` is required (F7) |
| Save / archive | `POST /api/v1/links`, dedup by sniffing an "already exists" error string | `POST /api/v3/save/` → **`201` created / `200` already existed**, both return `{ id, url }` | dedup becomes reliable; the fragile string match and the follow-up search are **deleted** |
| Highlight order | `startOffset` | no offset field on highlight documents | sort by `created_at`, then `id` |
| Highlight colour | `highlight.color` | not exposed on Reader highlight documents (see R6, **verify**) | the colour→callout map becomes a *tag*→callout map, or is fed from the v2 export (R3b) |
| Rate limits | none notable | **20 req/min** base, **50 req/min** for create/update; `429` + `Retry-After` | a client-side throttle is mandatory (R5) |
| Types | official OpenAPI spec → generated `schema.ts` + drift test | **no published OpenAPI spec** | hand-written models + fixture contract tests (R9); `npm run gen:api` and the drift test are **deleted** |

### Endpoint surface actually used

Base: `https://readwise.io/api`. Header: `Authorization: Token <token>`.

| Purpose | Call |
| --- | --- |
| Token valid? | `GET /v2/auth/` → 204 |
| List documents (paged) | `GET /v3/list/?category=&location=&tag=&updatedAfter=&pageCursor=` → `{ count, nextPageCursor, results[] }` |
| One document | `GET /v3/list/?id=<id>` |
| Save a URL | `POST /v3/save/` `{ url, title?, author?, summary?, location?, category?, tags?, saved_using? }` → 201 new / 200 existing, `{ id, url }` |
| Update a document | `PATCH /v3/update/<id>/` (optional, F6+) |
| Delete a document | `DELETE /v3/delete/<id>/` (optional, F6+) |
| _(alternative highlight source, R3b)_ | `GET /v2/export/?updatedAfter=&pageCursor=` → books with `highlights[]` incl. `text`, `note`, `color`, `location`, `highlighted_at` |

Document fields returned by `/v3/list/` (snake_case; the cursor is camelCase):
`id`, `url`, `source_url`, `title`, `author`, `source`, `category`, `location`,
`tags`, `site_name`, `word_count`, `created_at`, `updated_at`, `notes`,
`published_date`, `summary`, `image_url`, `parent_id`, `reading_progress`,
plus `first_opened_at`, `last_opened_at`, `saved_at`, `last_moved_at`, and
`html_content` only when `withHtmlContent=true`.

`category` ∈ `article | email | rss | highlight | note | pdf | epub | tweet | video`.
`location` ∈ `new | later | shortlist | archive | feed`.

## Functional requirements

Feature numbering is kept from the Linkwarden plugin so code comments and the
two specs stay comparable. **F7 is new** and is the price of the missing
search/per-parent endpoints.

### F1 — Document picker (link via search)
- A command with an assignable hotkey opens a `SuggestModal`.
- Typing searches the **local index** (F7) — title, author, `site_name`,
  `source_url`, tags — client-side and fuzzy. This is faster than Linkwarden's
  round-trip picker; it is also the only option, since Reader has no search API.
- Empty query → the most recently updated documents (index sorted by
  `updated_at`), so a source can be picked without typing.
- The result row shows title, `source_url` / `site_name`, `location`, tags.
- Selecting inserts a Markdown link at the cursor whose href is the document's
  `url`:
  ```markdown
  See [On RAG — example.org](https://read.readwise.io/read/01gnpwjqm3v0dhtqnj7v3qtn5r).
  ```
- Link text = readable fallback (title, else `source_url`), exactly as before.
- If the query is a URL with no match → offer **"Save to Reader"** inline, which
  runs F3's single-URL path and binds the result immediately.
- **No host coupling.** Unlike D1 for Linkwarden, `read.readwise.io` is a fixed
  public host, so a vault-wide find/replace is never needed and the link is
  clickable for the account owner without extra configuration.

### F2 — Highlight panel (display)
- A right-sidebar `ItemView`, reacting to `file-open` / `active-leaf-change`
  (debounced) — unchanged from Linkwarden.
- Bindings are found by scanning the note body for external links matching
  `https://read.readwise.io/read/<ulid>` and extracting `<ulid>`. External links
  are not in `metadataCache`, so the body is parsed (code fences, inline code,
  wikilinks and image embeds masked out first) — `src/core/links.ts` ports
  **verbatim**.
- Highlights come from the **local index** (F7), grouped per source document,
  each with its attached note (the `category=note` child) rendered as the
  comment.
- Sorted within a source by `created_at`, then `id` (R8).
- "Refresh" re-runs a delta sync for the bound documents and re-renders; the
  panel otherwise works fully offline from the persisted index.

### F3 — Save note URLs to Reader (export/archive)
- **Batch modal (core):** a command scans the active note's external URLs and
  lists them as checkboxes. Selected URLs are `POST`ed to `/v3/save/`, and the
  body link is rewritten in place to `https://read.readwise.io/read/<id>` (text
  kept as fallback). Select-all/none switch. `src/core/exportPlan.ts` and the
  rewrite logic port **verbatim**.
- Status per URL: **already bound** (href already a Reader read URL → grayed,
  not preselected) vs **new** (preselected).
- **Duplicates (R7):** `/v3/save/` is idempotent by URL. `201` = created,
  `200` = it already existed; both responses carry `{ id, url }`, so the binding
  is available either way in **one** request. No prerequisite setting, no
  "already exists" string sniffing, no follow-up search.
- Per-export options, defaulted from settings and overridable in the modal:
  **location** (`new` / `later` / `shortlist` / `archive` / `feed`) and **tags**.
  This replaces Linkwarden's "target collection".
- `saved_using: "obsidian-readwise"` is sent so the user can see in Reader where
  a document came from.
- **Throttled:** the batch respects the rate limiter (R5) and shows progress;
  a 40-URL note is ~1 minute at the create limit, and that must be visible.
- Reader ingests asynchronously; the export finishes at "saved + bound" without
  waiting for the parsed article. Highlights show up later via F2/F7.

### F4 — Insert highlight as a quote (opt-in)
- Per highlight in the panel, an "insert" action that materializes it at the
  cursor as a callout, with the source link in the callout title and the note as
  a `**Note:**` line — identical formatting rules and blank-line handling to the
  Linkwarden plugin (`src/core/quote.ts` ports with only the id type changed).
- **Block id:** `^rw-<highlight-ulid>`, e.g. `^rw-01h6qabyzghazrt1qsjvf9zeqa`.
  Obsidian block ids allow `[A-Za-z0-9-]`, so a ULID is valid; 29 characters is
  long but referenceable via `[[source#^rw-…]]`.
- **Duplicate protection (mandatory):** before inserting, scan the note for an
  existing `^rw-<id>`; if present, do not insert again. The id-boundary regex
  from `hasBlockId` is simplified — ULIDs are fixed-length, so the
  "`^lw-15` must not match `^lw-157`" problem disappears (a `(?![0-9a-z])`
  guard is still cheap insurance).
- **Semantics map (R6):** the Linkwarden colour→callout/tag map becomes a
  **tag→callout/tag** map keyed on the Reader tags of the highlight's parent
  document, with a default rule for untagged highlights. Same settings UX
  (rows of `key → callout + tag`, add/remove), same `mergeSettings` deep-merge
  so new default keys survive an upgrade.

### F5 — Re-link command
- Re-bind the source under the cursor via the F1 picker; only the href is
  swapped, the visible label is kept. Ports **verbatim** modulo the id type.
- Less load-bearing than in Linkwarden (Reader ids are stable and documents are
  not routinely recreated), but kept for parity and for documents deleted and
  re-saved.

### F6 — Browsable Reader tab _(nice-to-have)_
- The picker as a full `ItemView`, browsing the local index with
  location/category/tag filters. Cheap once F7 exists — it is a second view over
  the same index, with no extra API surface.

### F7 — Local index + sync engine _(new; forced by the API)_
The Reader API has no search and no per-parent highlight endpoint, so the plugin
maintains its own index. This is the single largest new component and the only
part with no counterpart in the Linkwarden plugin.

- **Shape** (persisted in `data.json` next to settings):
  ```ts
  interface Index {
    docs: Record<DocId, IndexedDoc>;        // category != highlight | note
    highlightsByParent: Record<DocId, Highlight[]>;
    noteByHighlight: Record<DocId, string>; // category=note, keyed by parent_id
    cursors: { docsUpdatedAfter?: string; highlightsUpdatedAfter?: string };
    syncedAt?: number;
  }
  ```
- **Only the fields the UI needs are stored** — `id`, `url`, `source_url`,
  `title`, `author`, `site_name`, `category`, `location`, `tags`, `updated_at`
  (~200 bytes/doc; 5 000 documents ≈ 1 MB of `data.json`). `html_content` is
  never requested (`withHtmlContent` stays off — it is documented as
  significantly slower).
- **First sync:** a full paged pull (`/v3/list/` with `pageCursor`) of documents
  and of `category=highlight` + `category=note`, throttled to the rate limit,
  with a progress notice and a cancel. Triggered on first successful token
  entry, not on install.
- **Delta sync:** `updatedAfter` = the last sync timestamp, run on plugin load,
  on the panel's refresh button, and on a configurable interval (default: on
  load + manual only). Deletions are not reported by `updatedAfter`, so a
  "rebuild index" button in settings does a full re-pull.
- **Bounded scope setting:** optionally index only chosen `location`s (e.g. skip
  `feed`) to keep first sync short for large libraries.
- **Offline:** the index is the source of truth for the UI; the network is only
  ever needed to refresh it. The panel therefore works offline by construction,
  replacing Linkwarden's per-source TTL cache (`core/cache.ts` is superseded).

## Settings

- **Access token** — created at <https://readwise.io/access_token>, stored in
  Obsidian's `SecretStorage`; settings hold only the secret *name*
  (`tokenSecretId`, default `readwise-token`) plus the plaintext `tokenFallback`
  for Obsidian without SecretStorage. Unchanged mechanism, unchanged branded
  `SecretName` / `TokenValue` types that prevent the name/value mix-up.
- **Connection test** — button; `GET /v2/auth/` → 204 = "Connected".
- **Default save location** — `new` / `later` / `shortlist` / `archive` / `feed`
  (replaces "default collection").
- **Default save tags** — comma-separated, applied by F3.
- **Tag → callout/tag map** — for F4 (R6).
- **Index scope** — which `location`s to index (default: all but `feed`).
- **Sync** — "Sync now" and "Rebuild index" buttons, last-synced timestamp,
  optional auto-sync interval.
- _No base URL, no deep-link target, no cache TTL, no collection._

## Non-functional / technical requirements

- **Two hard rules carry over unchanged:**
  1. `src/api/` and `src/core/` must stay free of any `obsidian` import — that
     is what keeps them unit-testable. Obsidian is touched only in `src/main.ts`,
     `src/ui/`, `src/obsidian/`.
  2. HTTP goes through Obsidian's `requestUrl`, never `fetch` (bypasses CORS at
     the Electron level). The client takes an injected `HttpClient`; the
     implementation must resolve for **any** status including 4xx/5xx and reject
     only on transport failure — the client interprets status codes itself
     (`200` vs `201` on save, `429` on throttle).
- **Rate limiting (R5):** a pure token-bucket in `src/core/rateLimit.ts` with an
  injectable clock, wrapped around the client. Conservative default: 20/min for
  reads, 50/min for `/v3/save/`. `429` responses honour `Retry-After` with a
  bounded number of retries. Every batch operation (sync, F3 export) drives the
  bucket and reports progress.
- **Fallback:** the visible Markdown link always stays intact if Readwise is
  unreachable.
- **Persistence:** `data.json` holds `{ settings, index }`. The token is never
  in it.

## Security / Operations

- **Token storage:** Obsidian `SecretStorage` (device-local, OS-backed), same as
  the Linkwarden plugin's D6 — including the `SecretComponent` pattern where the
  component owns the *value* and settings persist only the *name*, and the
  branded-type guard that makes `Bearer <name>` → 401 a compile error. Requires
  Obsidian ≥ 1.11.5 (≥ 1.12.7 for the current settings API); Linux needs an OS
  secret backend (kwallet/libsecret). Plaintext `tokenFallback` otherwise.
- **Scope of a Readwise token:** one token grants full read/write to the whole
  Readwise + Reader account (there are no scoped tokens). The README must say
  so, and the plugin must never write anything the user did not ask for — the
  only write is F3's `POST /v3/save/`.
- **Network use:** exactly one remote service, `readwise.io`. No request before
  a token is entered. No telemetry.

## Decisions

- **R1 — Binding:** ✅ Markdown link whose href is the document's own Reader URL
  `https://read.readwise.io/read/<id>`; id in the href is the single source of
  truth; link text is a readable fallback. (Same as Linkwarden's D1, minus the
  host-coupling caveat.)
- **R2 — Setup:** ✅ token only. No base URL in the UI; a non-user-facing
  `apiBase` default exists solely so the example vault can point at the mock
  server.
- **R3 — Highlight source:** ⚠️ **the one real fork.**
  - **R3a (recommended, default):** Reader v3 only —
    `GET /v3/list/?category=highlight` + `category=note`, joined by `parent_id`.
    One API, ids that join natively to the binding, covers documents that never
    left Reader. Costs a full first sync; no colour, no offsets.
  - **R3b (optional enrichment, later):** Readwise v2
    `GET /v2/export/?updatedAfter=` — returns books with `highlights[]` carrying
    `text`, `note`, **`color`**, `location`, `highlighted_at`, joined to Reader
    documents via the book's `unique_url` (the `read.readwise.io` URL). Restores
    colour semantics and gives a usable sort key, at the cost of a second API
    surface and a URL-based join.
  - **Decision:** define a `HighlightSource` interface, ship R3a, and keep R3b
    as a settings-gated "use Readwise highlight colours" enrichment. This keeps
    the build unblocked and defers R6 rather than guessing.
- **R4 — Index & sync:** ✅ persisted local index with `updatedAfter` deltas
  (F7). Supersedes Linkwarden's per-source TTL cache.
- **R5 — Rate limiting:** ✅ pure token bucket + `Retry-After` handling in the
  client, driven by every batch path.
- **R6 — Highlight semantics:** ✅ *provisional* — tag→callout/tag map keyed on
  the parent document's Reader tags, because v3 highlight documents expose no
  colour. Reverts to a colour map if R3b is enabled. **Verify against a live
  account before building F4.**
- **R7 — Dedup on save:** ✅ server-side and free — `201` vs `200` from
  `/v3/save/`, both returning the id. Linkwarden's D5 machinery is deleted.
- **R8 — Highlight order:** ✅ `created_at` then `id`; no `startOffset` exists.
  Document the limitation in the README (highlights appear in creation order,
  which normally equals reading order).
- **R9 — API types:** ✅ hand-written `src/api/models.ts` (no OpenAPI upstream),
  validated by **fixture contract tests** against redacted real responses in
  `tests/fixtures/`. `npm run gen:api`, `openapi/`, and
  `tests/openapi-drift.test.ts` are dropped; `docs/api-notes.md` records the
  verified endpoint surface and the date it was verified.

## Open questions to verify against a live account

`readwise.io` is unreachable from the environment this spec was written in
(blocked by the egress proxy), so the following are drawn from third-party
clients and documentation excerpts and **must be confirmed with one real token
before M1 is called done**. Each is cheap to check with a single request.

1. The field that carries a highlight document's **text** in `/v3/list/`
   (expected: `content`; third-party TS clients type it that way, and the
   Python client omits it).
2. Whether a highlight document exposes any **colour**-like field (drives R6).
3. That a **note** document's `parent_id` is the *highlight* id, not the
   article id (documentation says highlights and notes point at
   "the article/book/etc **and highlight** they belong to, respectively").
4. `/v3/list/` **page size**, so first-sync duration can be estimated honestly.
5. Exact **rate limits** — 20/min base and 50/min for create/update is the
   documented pair; confirm which bucket `/v3/list/` and `/v2/export/` fall in.
6. That `GET /v2/auth/` returns **204** for a Reader-only token.
7. Whether `/v3/list/` accepts `tag` (singular) or `tags`.
8. Whether Reader-saved documents appear in `/v2/export/` with
   `unique_url` = the `read.readwise.io` URL (only needed if R3b is taken).
