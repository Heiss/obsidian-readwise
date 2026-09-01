# Obsidian ↔ Readwise Reader Plugin — Requirements / Spec

_As of: 2026-09-01 · **Status: v0.3 — decisions R1–R12; highlights come from the Readwise v2 export, colour comes from tags** · not yet built_

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
single Markdown link whose href carries the document's Reader id. **The id in the
href IS the binding** — single source of truth, no separate id field, no URL
normalization.

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
| Auth header | `Authorization: Bearer <token>` | `Authorization: Token <token>` | one line in the client; token page is <https://readwise.io/access_token> |
| Token probe | `GET /api/v1/collections` | `GET /api/v2/auth/` → `204 No Content` | simpler, cheaper connection test |
| Id type | integer PK | opaque ULID-ish string, lowercase alphanumeric, ~25–28 chars | ids become **strings** everywhere: parse, index keys, block ids. **Length is not fixed** — do not hardcode 26 (R10) |
| Deep link | `<base>/links/<id>`, 3 configurable targets | `https://read.readwise.io/<location>/read/<id>` — the location is *in the path* | **deep-link-target setting is deleted**, but the parser must be location-agnostic (R10) |
| Search | server-side `GET /api/v1/search?searchQueryString=` | **none.** `/v3/list/` filters only by `id`, `updatedAfter`, `location`, `category`, `tag`, `limit` | a **local document index** is required (F7) |
| Highlights per source | `GET /api/v1/links/{id}/highlights` | **no per-parent endpoint** in either API. Reader v3 exposes highlights as individual documents (one page per ~100 highlights); Readwise v2 `GET /api/v2/export/` returns them **nested inside their book** | a **local highlight index** is required (F7), fed from the v2 export because it is dramatically cheaper (R3) |
| Save / archive | `POST /api/v1/links`, dedup by sniffing an "already exists" error string | `POST /api/v3/save/` → **`201` created / `200` already existed**, both return `{ id, url }` | dedup becomes reliable; the fragile string match and the follow-up search are **deleted** |
| Collections | `GET /api/v1/collections` → dropdown | `GET /api/v3/tags/` → `{ key, name }` | direct parity: the collection dropdown becomes a **tag** picker |
| Highlight order | `startOffset` | v3 highlight documents have no offset; the v2 export carries `location` + `highlighted_at` | sort by `location`, then `highlighted_at` — real reading order, another reason for R3 |
| Highlight colour | `highlight.color` | not exposed in the Reader v3 API at all | **colour is driven by tags** instead: an ordered tag→colour map in settings, with a default colour for anything unmatched (R6) |
| Rate limits | none notable | **per endpoint**: 20/min for reads, 50/min for save/update; `429` + `Retry-After` | a client-side throttle with two buckets is mandatory (R5) |
| Types | official OpenAPI spec → generated `schema.ts` + drift test | **no published OpenAPI spec** | hand-written models + fixture contract tests (R9); `npm run gen:api` and the drift test are **deleted** |

### Endpoint surface

Base: `https://readwise.io/api`. Header: `Authorization: Token <token>`.
Rate limits are **per endpoint, per access token**; `429` carries `Retry-After`
(seconds).

| Purpose | Call | Limit | Used by |
| --- | --- | --- | --- |
| Token valid? | `GET /v2/auth/` → 204 | — | settings connection test |
| List documents | `GET /v3/list/?id=&updatedAfter=&location=&category=&tag=&limit=&pageCursor=&withHtmlContent=&withRawSourceUrl=` → `{ count, nextPageCursor, results[] }` | **20/min** | F7 sync |
| One document | `GET /v3/list/?id=<id>` | 20/min | F5 re-link verify |
| List tags | `GET /v3/tags/?pageCursor=` → `{ count, nextPageCursor, results: [{ key, name }] }` | 20/min | settings tag picker, F4 map |
| Save a URL | `POST /v3/save/` | **50/min** | F3 |
| Update a document | `PATCH /v3/update/<id>/` | 50/min | F8 (optional) |
| Bulk update | `PATCH /v3/bulk_update/` — ≤ 50 items, `200` all ok / `207` partial / `400` bad payload | 20/min | F8 (optional) |
| Delete | `DELETE /v3/delete/<id>/` → 204 | 20/min | not used (see R11) |
| **Highlights (primary source, R3)** | `GET /v2/export/?updatedAfter=&pageCursor=` → `{ count, nextPageCursor, results: [ book ] }`, each book carrying `user_book_id`, `title`, `author`, `source`, `source_url`, `unique_url`, `book_tags[]`, `category`, and **all** of its `highlights[]` — each with `id`, `text`, `note`, `color`, `location`, `highlighted_at`, `updated_at`, `tags[]` | 20/min | F7 sync, F2, F4 |

`limit` is 1–100, **default 100** — so a 5 000-document library is 50 requests,
≈ 2½ minutes at 20/min. That is the honest first-sync cost.

**Document fields** returned by `/v3/list/` (snake_case; only the paging cursor
is camelCase): `id`, `url`, `source_url`, `title`, `author`, `source`,
`category`, `location`, `tags` (an **object** keyed by tag key, not an array),
`site_name`, `word_count`, `reading_time`, `listening_time`, `created_at`,
`updated_at`, `notes`, `published_date`, `summary`, `image_url`, `parent_id`,
`reading_progress`, `first_opened_at`, `last_opened_at`, `saved_at`,
`last_moved_at`; plus `html_content` / `raw_source_url` only when the
corresponding `with…` flag is set.

`category` ∈ `article | email | rss | highlight | note | pdf | epub | tweet | video`.

**`location` is asymmetric and this bites:**

- LIST filter accepts `new | later | shortlist | archive | feed`.
- SAVE and UPDATE accept only `new | later | archive | feed` — **`shortlist` is
  not settable via the API**, and an unavailable location silently falls back to
  the user's default rather than erroring.

So the F3 "save to" dropdown must offer four values, not five, while the F7 index
scope filter may offer all five. The silent fallback also means the plugin must
read the location back from the response rather than assume what it sent.

### The binding URL, precisely (R10)

The documented responses show the location **inside the path**:

```
https://read.readwise.io/new/read/0000ffff2222eeee3333dddd4444      (from SAVE)
https://read.readwise.io/feed/read/01gwfvp9pyaabcdgmx14f6ha0        (from LIST)
```

Two consequences the Linkwarden design never had to deal with:

1. **A document's own `url` changes when it is triaged.** Archiving an article in
   Reader moves it from `/new/read/<id>` to `/archive/read/<id>`. If the plugin
   pasted the response `url` verbatim into a note, every binding would drift out
   of date the moment the user triaged. The id never changes, so:
   - **parse permissively** — accept an optional location segment, and both the
     `read.readwise.io` and `readwise.io` hosts;
   - **insert canonically** — write the location-free
     `https://read.readwise.io/read/<id>`, so the note text is stable for the
     life of the document. _(Verify that the bare form resolves; if it does not,
     insert the `/new/read/<id>` form and rely on the permissive parser, which is
     safe either way.)_
2. **Ids are variable-length.** The documented examples run 25–28 characters. The
   parser must not hardcode a length, and `hasBlockId` must keep a real
   right-boundary guard (a short id must not match inside a longer one) — the
   opposite of the simplification an assumed fixed length would have allowed.

Parser shape: `^/(?:new|later|shortlist|archive|feed/)?read/([0-9a-zA-Z]+)$`
against the path, tolerant of trailing slash, query and fragment.

## Functional requirements

Feature numbering is kept from the Linkwarden plugin so code comments and the
two specs stay comparable. **F7 and F8 are new**; F7 is the price of the missing
search and per-parent endpoints.

### F1 — Document picker (link via search)
- A command with an assignable hotkey opens a `SuggestModal`.
- Typing searches the **local index** (F7) — title, author, `site_name`,
  `source_url`, tags — client-side and fuzzy. This is faster than Linkwarden's
  round-trip picker; it is also the only option, since Reader has no search API.
- Empty query → the most recently updated documents, so a source can be picked
  without typing.
- The result row shows title, `source_url` / `site_name`, `location`, tags.
- Selecting inserts a Markdown link at the cursor:
  ```markdown
  See [On RAG — example.org](https://read.readwise.io/read/01gkqtdz9xabcd5gt96khreyb).
  ```
- Link text = readable fallback (title, else `source_url`), exactly as before.
- If the query is a URL with no match → offer **"Save to Reader"** inline, which
  runs F3's single-URL path and binds the result immediately.
- **No host coupling.** Unlike Linkwarden's D1, `read.readwise.io` is a fixed
  public host, so a vault-wide find/replace is never needed.
- Highlight and note documents are excluded from the picker; only real sources
  are bindable.

### F2 — Highlight panel (display)
- A right-sidebar `ItemView`, reacting to `file-open` / `active-leaf-change`
  (debounced) — unchanged from Linkwarden.
- Bindings are found by scanning the note body for external links whose href
  parses per R10. External links are not in `metadataCache`, so the body is
  parsed (code fences, inline code, wikilinks and image embeds masked out first)
  — `src/core/links.ts` ports **verbatim**.
- Highlights come from the **local index** (F7), grouped per source document,
  each with its `note` rendered as the comment and a colour bar driven by the
  tag→colour map (R6).
- The parent document's own top-level `notes` field is shown once at the top of
  the group — Reader has a document-level note that Linkwarden had no analogue
  for, and it is free to display.
- Sorted within a source by `location`, then `highlighted_at` (R8) — genuine
  reading order, which the v3 highlight documents could not have given.
- "Refresh" runs a delta sync and re-renders; the panel otherwise works fully
  offline from the persisted index.

### F3 — Save note URLs to Reader (export/archive)
- **Batch modal (core):** a command scans the active note's external URLs and
  lists them as checkboxes. Selected URLs are `POST`ed to `/v3/save/`, and the
  body link is rewritten in place to the canonical binding href (text kept as
  fallback). Select-all/none switch. `src/core/exportPlan.ts` and the rewrite
  logic port **verbatim**.
- Status per URL: **already bound** (href already parses as a binding → grayed,
  not preselected) vs **new** (preselected).
- **Duplicates (R7):** `/v3/save/` is idempotent by URL. `201` = created,
  `200` = it already existed; both responses carry `{ id, url }`, so the binding
  is available either way in **one** request. No prerequisite setting, no
  "already exists" string sniffing, no follow-up search.
- Per-export options, defaulted from settings and overridable in the modal:
  **location** (`new` / `later` / `archive` / `feed` — *not* `shortlist`) and
  **tags** (autocompleted from `GET /v3/tags/`).
- `saved_using: "obsidian-readwise"` is sent, so the user can see in Reader where
  a document came from; it also makes the plugin's own writes identifiable.
- **Throttled:** the batch drives the 50/min save bucket and shows progress; a
  60-URL note takes over a minute, and that must be visible with a cancel.
- Reader ingests asynchronously; the export finishes at "saved + bound" without
  waiting for the parsed article. Highlights show up later via F2/F7.

### F4 — Insert highlight as a quote (opt-in)
- Per highlight in the panel, an "insert" action that materializes it at the
  cursor as a callout, with the source link in the callout title and the note as
  a `**Note:**` line — identical formatting rules and blank-line handling to the
  Linkwarden plugin (`src/core/quote.ts` ports with only the id type changed).
- **Block id:** `^rw-<highlight-id>`, e.g. `^rw-01h6qabyzghazrt1qsjvf9zeqa`.
  Obsidian block ids allow `[A-Za-z0-9-]`, so a Reader id is valid.
- **Duplicate protection (mandatory):** before inserting, scan the note for an
  existing `^rw-<id>`. Because ids are variable-length (R10), the boundary guard
  `(?![0-9a-zA-Z])` is load-bearing, not decoration.
- **Tag → colour map (R6):** colour is derived from **tags**, not from the API.
  The user configures, in plugin settings, which tags mean which colour; anything
  that matches no rule gets the **default colour**. Each rule is
  `tag → { color, callout, tag? }`, so one setting drives both the panel's colour
  bar (F2) and the callout type used on insert (F4) — the same shape and the same
  settings UX as Linkwarden's colour map, just keyed differently.
  - **Rules are an ordered list, first match wins.** A highlight can carry
    several tags, so an unordered map would make the outcome depend on object key
    order. The settings UI must let rows be reordered.
  - **Key source:** a highlight's own `tags[]` first, falling back to its book's
    `book_tags[]`. Both arrive in the same v2 export payload, so this costs
    nothing and removes what was an open question about where tags live.
  - Rule keys are offered from `GET /v3/tags/` so they are picked, not typed
    blind; free entry stays allowed.

### F5 — Re-link command
- Re-bind the source under the cursor via the F1 picker; only the href is
  swapped, the visible label is kept. Ports **verbatim** modulo the id type.
- Less load-bearing than in Linkwarden — Reader ids are stable, and thanks to
  R10 a triaged document does not break its binding — but kept for parity and
  for documents deleted and re-saved.

### F6 — Browsable Reader tab _(nice-to-have)_
- The picker as a full `ItemView`, browsing the local index with
  location/category/tag filters. Cheap once F7 exists — a second view over the
  same index, no extra API surface.

### F7 — Local index + sync engine _(new; forced by the API)_
Neither API has search or a per-parent highlight endpoint, so the plugin
maintains its own index. This is the largest new component and the only part with
no counterpart in the Linkwarden plugin. **The design goal is the lowest possible
request count**, because every request is 1/20th of a minute's budget and the
first sync happens immediately after the user pastes their token.

#### Two sources, cleanly split

| Source | Endpoint | Gives |
| --- | --- | --- |
| Highlights | `GET /v2/export/` | every highlighted source with **all** its highlights nested: `text`, `note`, `color`, `location`, `highlighted_at`, `tags[]`, plus the book's `title`, `author`, `source_url`, `unique_url`, `book_tags[]` |
| Documents | `GET /v3/list/` | the rest of the Reader library, for picking sources you have not highlighted and for F3 |

Reader v3's own `category=highlight` / `category=note` streams are **not used at
all**. They cost one request per ~100 highlights, carry no colour, no note in the
same object, and no sort key — and the field holding the highlighted text is not
even documented. The v2 export returns highlights grouped per book, so a library
of 20 000 highlights across 400 sources costs a number of requests proportional
to the *books*, not the highlights. That is the single biggest lever on sync
cost, and it also happens to be the richer payload.

#### Tiered sync (R12) — the low-request-count design

**Tier 1, the default: the export alone.** `GET /v2/export/` is enough to power
the panel *and* a picker over every source you have ever highlighted, because
each book carries its own title, author and `unique_url`. For most users this is
a handful of requests and the plugin is fully usable within seconds.

**Tier 2, opt-in: the full document index.** `GET /v3/list/` paged at
`limit=100`, so the picker also covers documents you have saved but not
highlighted, and F3 can tell "already in Reader" from "new". This is the
expensive tier (one request per 100 documents, and RSS-heavy libraries are
large), so it is off by default, scoped by `location` (never `feed` by default),
and clearly labelled with what it costs.

**Delta sync** for both: `updatedAfter` = the last successful sync, run on plugin
load, on the panel's refresh button, and optionally on an interval. Steady-state
cost is one or two requests. Concurrent syncs coalesce; repeated "Sync now"
clicks cannot pile up.

**Deletions are not reported by `updatedAfter`** in either API, so settings carry
a "rebuild index" button that does a full re-pull. It is the only correctness
backstop against a highlight deleted in Readwise lingering in the panel.

#### Shape (persisted outside `data.json` — see below)

```ts
interface Index {
  /** Bindable sources, from the export (tier 1) and the list (tier 2). */
  docs: Record<DocId, IndexedDoc>;
  highlightsByParent: Record<DocId, IndexedHighlight[]>;
  /** Books the export returned that could not be joined to a Reader id. */
  unjoined: UnjoinedBook[];
  tags: Array<{ key: string; name: string }>;
  cursors: { exportUpdatedAfter?: string; docsUpdatedAfter?: string };
  /** Distinguishes "no highlights" from "not synced yet". */
  highlightsSyncedAt?: number;
  tier2SyncedAt?: number;
}
```

- **Only the fields the UI needs are stored** (~200 bytes/doc). `withHtmlContent`
  and `withRawSourceUrl` are never requested — both are documented to slow the
  request and neither is needed.
- **The join:** an exported book maps to a Reader document by `unique_url`
  (expected to be the `read.readwise.io` URL), falling back to matching
  `source_url` against the tier-2 index. Books that join to nothing — Kindle,
  podcasts, manually added highlights — are kept in `unjoined` and simply never
  bind. They are not an error.
- **Not persisted in `data.json`.** The index goes in its own file in the plugin
  folder, written debounced. `data.json` is parsed synchronously on plugin load
  and rewritten whole on every save; a library-sized blob there is a startup
  stall and a vault-sync conflict generator.
- **The index is derived state.** Nothing user-authored lives in it, so the
  recovery for any corruption, schema change or failed migration is "rebuild".
  Every decision that keeps this true is worth defending.
- **Offline:** the index is the source of truth for the UI; the network is only
  ever needed to refresh it. The panel works offline by construction, replacing
  Linkwarden's per-source TTL cache.

### F8 — Write back to Reader _(optional, post-1.0)_
Reader, unlike Linkwarden, has real write endpoints. Kept out of the first
release deliberately (R11), but the shape is decided so it is not designed under
pressure later:

- "Archive in Reader" / "Move to Later" on a panel source → `PATCH /v3/update/<id>/`
  with `{ location }`.
- "Add tag" on a panel source → `PATCH /v3/update/<id>/` with the merged `tags`
  list (the field **replaces** all existing tags, so the plugin must merge, never
  send a bare new tag).
- A multi-source action over one note → `PATCH /v3/bulk_update/`, ≤ 50 items per
  request, handling `207` per-item failures individually.
- `seen: true/false` is available but not exposed — nothing in the Obsidian flow
  legitimately means "I opened this in Reader".
- `DELETE /v3/delete/` is deliberately **never** called. A plugin that can
  silently delete from the user's library is a plugin one bad click away from
  data loss, and nothing in this design needs it.

### Not in scope: webhooks
Readwise offers webhooks for highlight/document create/update/delete. They
require a public HTTPS endpoint to receive the callback, which an Obsidian
plugin on a user's laptop does not have. `updatedAfter` polling is the correct
mechanism here; the README should say so, so the omission does not read as an
oversight.

## Settings

- **Access token** — created at <https://readwise.io/access_token>, stored in
  Obsidian's `SecretStorage`; settings hold only the secret *name*
  (`tokenSecretId`, default `readwise-token`) plus the plaintext `tokenFallback`
  for Obsidian without SecretStorage. Unchanged mechanism, unchanged branded
  `SecretName` / `TokenValue` types that prevent the name/value mix-up.
- **Connection test** — button; `GET /v2/auth/` → 204 = "Connected".
- **Default save location** — `new` / `later` / `archive` / `feed`
  (replaces "default collection"; no `shortlist` — the API rejects it).
- **Default save tags** — picked from `GET /v3/tags/`, free entry allowed.
- **Tag → colour map** — the ordered rule list from R6: each row is
  `tag → colour + callout (+ optional Obsidian tag)`, reorderable, with keys
  offered from `GET /v3/tags/`. Drives both the panel colour bar and F4's
  callout type.
- **Default colour** — used for any highlight matching no rule. Ships as
  yellow / `[!quote]`, matching Readwise's own default highlight.
- **Index scope** — whether to build the tier-2 document index at all, and if so
  which `location`s (default: off; when enabled, all but `feed`). The setting
  states the request cost in plain words.
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
     (`201` vs `200` on save, `207` on bulk update, `429` on throttle).
- **Rate limiting (R5):** a pure token-bucket in `src/core/rateLimit.ts` with an
  injectable clock, wrapped around the client, with **two buckets**: 20/min for
  `list` / `tags` / `bulk_update` / `delete`, 50/min for `save` / `update`.
  `429` responses honour `Retry-After` with a bounded number of retries. Every
  batch operation (sync, F3 export) drives the bucket and reports progress.
- **Fallback:** the visible Markdown link always stays intact if Readwise is
  unreachable.
- **Persistence:** `data.json` holds `{ settings, index }`. The token is never
  in it.

## Security / Operations

- **Token storage:** Obsidian `SecretStorage` (device-local, OS-backed), same as
  the Linkwarden plugin's D6 — including the `SecretComponent` pattern where the
  component owns the *value* and settings persist only the *name*, and the
  branded-type guard that makes `Token <name>` → 401 a compile error. Requires
  Obsidian ≥ 1.11.5 (≥ 1.12.7 for the current settings API); Linux needs an OS
  secret backend (kwallet/libsecret). Plaintext `tokenFallback` otherwise.
- **Scope of a Readwise token:** one token grants full read/write to the whole
  Readwise + Reader account — there are no scoped or read-only tokens, and the
  same token can delete documents. The README must say so plainly, and the
  plugin's restraint (only `POST /v3/save/` writes in 1.0; `DELETE` never) is
  part of the contract with the user, not an implementation detail.
- **Network use:** exactly one remote service, `readwise.io`. No request before a
  token is entered. No telemetry.

## Decisions

- **R1 — Binding:** ✅ Markdown link whose href carries the Reader document id;
  id in the href is the single source of truth; link text is a readable
  fallback. (Same as Linkwarden's D1, minus the host-coupling caveat.)
- **R2 — Setup:** ✅ token only. No base URL in the UI; a non-user-facing
  `apiBase` default exists solely so the example vault can point at the mock
  server.
- **R3 — Highlight source:** ✅ **settled: `GET /v2/export/` is primary.** It
  wins on every axis that matters — requests proportional to *books* rather than
  to highlights (the dominant term in first-sync cost), a documented `text`
  field, `note` in the same object, `location` + `highlighted_at` for real
  reading order, and per-highlight `tags` that R6 needs. Reader v3's
  `category=highlight` / `category=note` streams are not used. The cost is a
  second API surface and a URL-based join, both accepted. Same token for both.
- **R4 — Index & sync:** ✅ persisted local index with `updatedAfter` deltas
  (F7), `limit=100` paging, explicit rebuild for deletions. Supersedes
  Linkwarden's per-source TTL cache.
- **R5 — Rate limiting:** ✅ two pure token buckets (20/min reads, 50/min
  writes) + `Retry-After` handling, driven by every batch path.
- **R6 — Colour semantics:** ✅ **colour comes from tags.** The user configures
  an ordered list of rules mapping a tag to a colour (and the callout type used
  on insert); the first rule whose tag the highlight carries wins; anything
  unmatched gets the configurable **default colour**. Keys are read from the
  highlight's own `tags[]`, falling back to its book's `book_tags[]`. The v2
  export also returns Readwise's native `color`, which this design deliberately
  **ignores** — one mechanism, under the user's control, rather than two that
  can disagree.
- **R7 — Dedup on save:** ✅ server-side and free — `201` vs `200` from
  `/v3/save/`, both returning the id. Linkwarden's D5 machinery is deleted.
- **R8 — Highlight order:** ✅ `location` then `highlighted_at`, both from the
  v2 export — genuine reading order, and one of the reasons R3 went the way it
  did.
- **R9 — API types:** ✅ hand-written `src/api/models.ts` (no OpenAPI upstream),
  covering both the v3 document shape and the v2 export shape, validated by
  **fixture contract tests** against redacted real responses in
  `tests/fixtures/`. `npm run gen:api`, `openapi/`, and
  `tests/openapi-drift.test.ts` are dropped; `docs/api-notes.md` records the
  verified endpoint surface and the date it was verified (2026-09-01).
- **R10 — Binding URL form:** ✅ parse permissively (optional location segment,
  either host, variable-length id), insert canonically
  (`https://read.readwise.io/read/<id>`). This is what keeps a binding stable
  when the user triages the document in Reader. Ids are **not** fixed-length, so
  the block-id boundary guard stays.
- **R11 — Write-back scope:** ✅ 1.0 writes exactly one thing: `POST /v3/save/`.
  `PATCH /v3/update/` and `/v3/bulk_update/` are designed (F8) but deferred;
  `DELETE /v3/delete/` is never called. This preserves Linkwarden's D4 property —
  a near-zero conflict surface — while leaving the door open, and it keeps the
  plugin's blast radius small given an unscoped account token.
- **R12 — Tiered sync:** ✅ the export alone is the default and is enough for the
  panel and for picking any source you have highlighted; the full v3 document
  index is opt-in, off by default, and labelled with its cost. Lowest request
  count for the common case, with the expensive tier available to whoever wants
  it.

## Open questions to verify against a live account

The official docs (2026-09-01) settled page size (`limit`, 1–100, default 100),
per-endpoint rate limits, `tag` singular, `GET /v2/auth/` → 204, and — verbatim —
that a note's `parent_id` is its **highlight**, not the article. Choosing the v2
export as the highlight source (R3) settled two more: the highlighted text is the
documented `text` field, and per-highlight `tags` arrive in the same payload,
so R6 no longer depends on an unknown.

What remains, in order of what rides on it:

1. **Does `unique_url` on an exported book give the Reader document id?** This is
   now the load-bearing unknown: it is what joins a highlight to its binding. The
   `source_url` fallback covers the case where it does not, but only for
   documents the tier-2 index has seen — so if `unique_url` is not the
   `read.readwise.io` URL, tier 1 alone stops being sufficient and R12's default
   changes. One `GET /v2/export/?ids=<a Reader book>` answers it.
2. **How many requests does a real export actually take?** The v2 export's page
   size is not documented — it paginates by `nextPageCursor` over books. The
   whole R3/R12 argument rests on this being much cheaper than paging highlights
   individually; measure it rather than assume it.
3. **Do all Reader highlights reach the Readwise library, and how quickly?** The
   export is a Readwise-side view. If a fresh Reader highlight takes minutes to
   appear there, the panel's "refresh" needs to say so rather than look broken.
4. **Whether the location-free `https://read.readwise.io/read/<id>` resolves.**
   Only affects which string is written into notes; the permissive parser (R10)
   keeps the plugin correct either way.
5. **Whether Readwise normalizes URLs on save** (trailing slash, `www`, tracking
   parameters), which decides whether F3 needs to strip tracking parameters
   before saving to avoid duplicate documents.

Record the answers in `docs/api-notes.md` and capture redacted responses into
`tests/fixtures/` as they are confirmed (R9).
