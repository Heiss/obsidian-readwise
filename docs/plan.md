# Build plan — obsidian-readwise

Companion to [spec.md](spec.md) and [red-team.md](red-team.md). The spec says
*what* and *why*, the red team says *where it breaks*; this file says *in what
order*, *from which file*, and *how it is tested*.

Revised 2026-09-01 after the official Reader API docs and the red-team pass:
the verification spike moved ahead of all coding, the picker now ships before
the highlight sync, and the index moved out of `data.json`.

Starting point: this repository is empty. The plan is a **port** of
[Heiss/obsidian-linkwarden](https://github.com/Heiss/obsidian-linkwarden)
(v0.3.3, ~7 800 LOC incl. tests), not a from-scratch build — the architecture,
build tooling, CI, i18n, settings machinery and roughly half the pure logic
carry over unchanged.

## Port map

Every file of the source plugin, and what happens to it. `verbatim` = copy and
change only names/imports; `adapt` = same shape, changed logic; `new` = no
counterpart upstream.

### Infrastructure — copy first, change nothing but names

| File | Action | Notes |
| --- | --- | --- |
| `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.ts` | verbatim | drop the `gen:api` script and the `openapi-typescript` devDependency (R9) |
| `eslint.config.mjs` | verbatim | keep `eslint-plugin-obsidianmd`; re-do the sentence-case brand override for "Readwise"/"Reader" (see `knowledge/plugin-review/`) |
| `.github/workflows/ci.yml` | verbatim | typecheck → lint → test → build |
| `.github/workflows/release.yml` | verbatim | tag == `manifest.json` version, build provenance attestation, loose `main.js`/`manifest.json`/`styles.css` assets |
| `flake.nix`, `flake.lock` | verbatim | incl. the `obsidian-test` launcher |
| `manifest.json`, `versions.json` | adapt | `id: readwise-reader`, `minAppVersion: 1.12.7`, `isDesktopOnly: false` |
| `styles.css` | adapt | rename the `lw-` class prefix to `rw-` |
| `knowledge/` | verbatim | the community-plugin-review notes apply unchanged |
| `LICENSE` | verbatim | MIT |

### `src/core/` — pure logic, no Obsidian import

| File | Action | Notes |
| --- | --- | --- |
| `links.ts` | **verbatim** | markdown/bare-URL extraction with code-fence, inline-code, wikilink and image masking. Nothing in it is Linkwarden-specific except the `parseBindingId` call and the `Binding.id` type (`number` → `string`) |
| `exportPlan.ts` | **verbatim** | classify + `applyRewrites` (reverse-order, offset-safe) |
| `binding.ts` | **verbatim** | label choice + `[label](href)` formatting |
| `quote.ts` | adapt | id type `number` → `string`; block-id prefix `lw-` → `rw-`; `hasBlockId` keeps a real right-boundary guard `(?![0-9a-zA-Z])` — ids are **not** fixed-length, so prefix collisions stay possible; blank-line separator logic unchanged |
| `secretId.ts` | verbatim | branded `SecretName` / `TokenValue`; constant → `readwise-token` |
| `urls.ts` | **adapt (rewrite)** | `buildDeepLink(id)` → the canonical, location-free `https://read.readwise.io/read/<id>`; `parseBindingId(href)` is **permissive** — optional `new\|later\|shortlist\|archive\|feed` path segment, either `read.readwise.io` or `readwise.io` host, **variable-length** id, tolerant of query/fragment/trailing slash (R10). The three-target `DeepLinkTarget` union is deleted |
| `colorMap.ts` | adapt | becomes `semanticsMap.ts`: tag → `{ callout, tag? }`, plus a `*` default rule (R6 — the Reader API exposes no highlight colour) |
| `cache.ts` | **deleted** | superseded by the index (F7) |
| `persistence.ts` | **new** | the index does **not** live in `data.json` (red team A3): separate file in the plugin folder, debounced writes, settings stay in `data.json`. Loading the whole library synchronously on plugin start is a startup stall and a review objection |
| `rateLimit.ts` | **new** | token bucket, injectable `now()`, `acquire()` returning a delay; **two** buckets — 20/min for `list`/`tags`/`bulk_update`, 50/min for `save`/`update`. Budgets deliberately *below* the published limits: the token is shared with whatever else the user runs against Readwise |
| `index.ts` | **new** | the persisted index: shape, merge-a-page, group-by-`parent_id`, attach notes to highlights, fuzzy search over docs, sort. Carries a **highlight-sync watermark** and a **resume cursor** so "no highlights" and "not synced yet" are distinguishable (red team A6), and defined handling for orphans — a highlight whose parent is gone, a binding to a document that is not the user's (A7) |
| `sync.ts` | **new** | pure sync driver: given a "fetch page" function and a cursor, produce the sequence of requests and the resulting index mutations. Pure so the whole sync is unit-testable with a fake clock and fake pages. Independent cursors for documents / highlights / notes — never collapsed into one (A5). Coalesces concurrent runs |

### `src/api/`

| File | Action | Notes |
| --- | --- | --- |
| `http.ts` | **verbatim** | the `HttpClient` contract (resolve on any status, reject only on transport failure) is exactly what the 200-vs-201 and 429 paths need |
| `schema.ts` (generated) | **deleted** | no upstream OpenAPI (R9) |
| `models.ts` | **adapt (rewrite)** | hand-written `ReaderDocument`, `Highlight`, `SaveDocumentBody`, `ListResponse<T>`; required-field narrowing kept in the same style |
| `client.ts` | adapt | same shape, new calls: `checkConnection()` (`GET /v2/auth/` → 204), `listDocuments({ id, category, location, tag, updatedAfter, limit, pageCursor })`, `listTags()` (`GET /v3/tags/` — the direct replacement for `getCollections()`), `save(body)` returning `{ document, alreadyExisted }` from the 201/200 split. Wrapped by the rate limiter. **No `delete()` method is written at all** (R11): the restraint is enforced by absence, not by discipline. `search()`, `recent()` and `createLink()`'s duplicate machinery are gone |

### `src/obsidian/`

| File | Action | Notes |
| --- | --- | --- |
| `httpAdapter.ts` | verbatim | `requestUrl` with `throw: false`, guarded `res.json` |
| `tokenStore.ts` | verbatim | SecretStorage + plaintext fallback |
| `secretComponent.ts` | verbatim | the `SecretName`-typed wrapper |

### `src/ui/`

| File | Action | Notes |
| --- | --- | --- |
| `settingsTab.ts` | adapt, **do not port the compat shim** | upstream carries a dual declarative/imperative implementation for Obsidian < 1.13; a greenfield plugin has no installed users, so set `minAppVersion: 1.13` and write **only** `getSettingDefinitions()` — that deletes roughly half the file and all of its dual-path drift risk (red team A10). Port the hard parts: the `SecretComponent` pattern, the branded types, the rerender dance. Rows: token, connection test, default location (4 values — the API rejects `shortlist`), default tags (from `listTags()`), semantics map, index scope, sync controls. Base URL / deep-link target / collection / cache TTL rows are deleted |
| `picker.ts` | adapt | `SuggestModal` over the local index instead of a network search; empty query → most-recently-updated; unmatched URL → "Save to Reader" |
| `panel.ts` | adapt | same `ItemView`, same toolbar, same insert-at-cursor and reading-mode handling. Source of highlights changes from `client.getHighlights(id)` + TTL cache to an index lookup + optional delta sync. Also renders the document-level `notes` field, which Linkwarden had no analogue for. Must distinguish *not synced yet* from *no highlights* (A6) and render orphans honestly (A7) |
| `exportModal.ts` | adapt | same checkbox modal and vault-scan; per-export **location + tags** controls replace the collection dropdown; progress line driven by the rate limiter, with a cancel. Says plainly that "saved" does not mean "parsed" — Reader scrapes asynchronously and some pages fail (red team §5) |
| `archive.ts` | adapt → `save.ts` | collapses to a single `POST /v3/save/`; the "already exists → search → bind" branch disappears |
| `relink.ts` | verbatim | modulo the id type |
| `syncStatus.ts` | **new** | small shared helper: progress notice, cancel, last-synced label (used by settings and the panel) |

### `src/i18n/`, `src/settings.ts`, `src/main.ts`

| File | Action | Notes |
| --- | --- | --- |
| `i18n/index.ts` | verbatim | locale selection off `getLanguage()`, English fallback |
| `i18n/en.ts`, `i18n/de.ts` | adapt | same key structure; retranslate the strings that changed (collection → location, archive → save, plus the new sync strings). English is the source of truth; a test asserts de/en key parity |
| `settings.ts` | adapt | new shape (see spec "Settings"); keep `mergeSettings`'s deep-merge of the nested map so new default keys survive upgrades |
| `main.ts` | adapt | same `Plugin` skeleton: register view, commands, ribbon, settings tab; owns settings + index + sync; `getClient()` returns `null` when the token is missing (no base-URL branch any more) |

### `example-vault/`

| File | Action | Notes |
| --- | --- | --- |
| `mock-linkwarden/server.mjs` | adapt → `mock-readwise/server.mjs` | dependency-free Node stub of `/v2/auth/`, `/v3/list/` (with `pageCursor`, `category`, `updatedAfter`) and `/v3/save/` (201/200 split), with a handful of documents, highlights and notes. This is what makes the whole thing developable without a Readwise account |
| vault files, `.obsidian/` config | adapt | `apiBase: http://localhost:8788/api`, `tokenFallback: demo-token` |

## Milestones

Each milestone ends green on `npm run typecheck && npm run lint && npm test && npm run build`.

**M-1 — Verification spike. Before any code.** One access token, roughly ten
requests, half a day. Settle the questions in [red-team.md §6](red-team.md):
which field carries a highlight document's text (**blocking — F2 cannot be built
without it**), whether `/v2/export/` beats `/v3/list/` on request count for a
real library, whether the location-free `read.readwise.io/read/<id>` URL
resolves, whether a highlight's `tags` are its own or its parent's, and whether
Readwise normalizes URLs on save. Output: `docs/api-notes.md` plus redacted
responses in `tests/fixtures/`. One of these answers can still change the
architecture, which is exactly why it comes first.

**M0 — Scaffold.** Repo skeleton, build/test/lint tooling, CI + release
workflows, `manifest.json` (`minAppVersion: 1.13`), empty plugin that loads.
Port `core/links.ts`, `core/exportPlan.ts`, `core/binding.ts` and their tests
verbatim as the first proof the toolchain works. _No Readwise code yet._

**M1 — API layer + setup UX.** `api/http.ts`, `api/models.ts`, `api/client.ts`,
`core/rateLimit.ts`, `obsidian/tokenStore.ts`, `obsidian/secretComponent.ts`,
`core/secretId.ts`, `settings.ts`, and the settings tab reduced to **token +
connection test**. This is the milestone that delivers the headline UX: paste a
token, press "Test connection", see "Connected".

**M2 — Document index + picker (F1).** The documents half of F7 —
`core/index.ts`, `core/sync.ts`, `core/persistence.ts`, the mock server — and
then `core/urls.ts` and `ui/picker.ts` straight on top of it.

_Re-sequenced deliberately._ The obvious order is "whole index, then picker",
but a documents-only index is roughly one request per 100 documents, so the
picker is usable in about a minute of syncing, and the milestone ends with
something a user can actually do. It also keeps the plan's longest stretch of
invisible work from landing in one block.

**M3 — Highlight index + panel (F2).** The rest of F7 (highlight and note pulls,
independent cursors, watermark, orphan handling) plus `ui/panel.ts`. Highlights
sync in the background behind the picker from M2, which is what stops a large
library's first sync from becoming a wall between the user and the product.

**M4 — F3 save/export.** `ui/exportModal.ts`, `ui/save.ts`, location + tags,
throttled batch with progress and cancel.

**M5 — F4 insert as quote.** `core/quote.ts`, `core/semanticsMap.ts`, the map
editor in settings, duplicate-block-id protection.

**M6 — F5 re-link, i18n, docs, release.** `ui/relink.ts`, `i18n/en.ts` +
`de.ts`, README (usage / setup / **honest limitations** / network-use & privacy
sections mirroring the Linkwarden README), `example-vault` polish, the
community-plugin checklist from `knowledge/`, first tagged release.

_Optional afterwards:_ F6 browsable tab; F8 write-back (`PATCH /v3/update/`,
`/v3/bulk_update/`) — never `DELETE`; R3b colour enrichment via `/v2/export/`,
unless M-1 promotes it to the primary highlight source.

## Test plan

Mirrors the upstream suite (13 files, ~1 100 lines) — everything pure is unit
tested, nothing touching Obsidian is.

| Test | Source | Notes |
| --- | --- | --- |
| `links.test.ts` | verbatim | masking, offsets, bare vs markdown |
| `exportPlan.test.ts` | verbatim | classification + reverse-order rewrites |
| `binding.test.ts` | verbatim | label choice, `[]` escaping |
| `spacing.test.ts` | verbatim | blank-line separators around an inserted callout |
| `secretId.test.ts` | verbatim | branded types, id validation |
| `tokenStore.test.ts` | verbatim | SecretStorage present/absent, fallback |
| `i18n.test.ts` | verbatim | de/en key parity |
| `urls.test.ts` | rewritten | permissive parse: with and without each location segment, both hosts, **short and long ids**, query/fragment/trailing slash, non-Readwise URLs, and the canonical form round-tripping |
| `quote.test.ts` | adapted | callout rendering, note line, block-id placement, and the boundary case that matters: a short id must not match inside a longer one |
| `semanticsMap.test.ts` | adapted | tag → callout/tag, default rule, unknown key |
| `client.test.ts` | adapted | fake `HttpClient`: auth header shape, **201 vs 200 on save**, `nextPageCursor` paging, `limit` handling, 4xx error text, **429 + `Retry-After`**, and that the client's location value is read back from the response rather than assumed (the API silently substitutes a location the user has not enabled) |
| `rateLimit.test.ts` | new | token bucket with an injected clock: burst, refill, two independent buckets |
| `index.test.ts` | new | merge a page, group highlights by `parent_id`, attach notes to highlights, fuzzy search ranking, sort by `created_at`, **watermark semantics** (unsynced vs genuinely empty), orphaned highlight, binding to an unknown document |
| `sync.test.ts` | new | full pull over N fake pages, delta by `updatedAfter`, independent document/highlight/note cursors, cancel mid-run, cursor persistence, resume after failure, two concurrent "sync now" calls coalescing into one |
| `fixtures.test.ts` | new | parse the recorded redacted responses in `tests/fixtures/` into the hand-written models — the R9 replacement for the OpenAPI drift test |
| `persistence.test.ts` | new | debounced writes coalesce; a corrupt or absent index file degrades to "rebuild", never to a crash (the index is derived state — see red team A4) |

Manual end-to-end runs go through `example-vault/` + the mock server, exactly as
upstream (`node example-vault/mock-readwise/server.mjs`, then open the vault).
**The mock serves the recorded fixtures** rather than its own hand-written
shapes — otherwise the whole suite can pass green against a fiction (red team
A12).

## Risks and how the plan absorbs them

The full analysis is in [red-team.md](red-team.md); this is the short form and
where each risk is paid for.

| Risk | Absorbed by |
| --- | --- |
| **Highlight text may not be retrievable from `/v3/list/`** — F2 depends on it and no documented field is it | **M-1**, before any code. If the answer is bad, the primary highlight source becomes `/v2/export/` and M3 changes shape |
| **First sync could take ~35 minutes** for a large library, landing right after the token is pasted — against a "ready to go" promise | documents-first sequencing (M2 ships the picker in ~1 minute of syncing, M3 backfills highlights); index scope excludes `feed`; `/v2/export/` measured in M-1 as a cheaper highlight source |
| **A multi-megabyte index in `data.json`** stalls startup, rewrites on every panel refresh, and produces vault-sync conflict files | `core/persistence.ts`: separate file, debounced writes, settings stay in `data.json` |
| **`updatedAfter` never reports deletions**, so the panel goes silently stale | independent cursors per category, "rebuild index" treated as a correctness backstop rather than a nicety, and the limitation stated in the README |
| **"Not synced yet" is indistinguishable from "no highlights"** | watermark + resume cursor in the index shape, specified before `sync.ts` is written |
| **Rate limits are per token and shared** with the user's other Readwise tools | budget below the published limits, treat `429` as normal, coalesce repeated syncs |
| **No OpenAPI spec** → silent upstream drift, which the Linkwarden plugin caught automatically | fixture contract tests + a dated `docs/api-notes.md`; drift shows up as a failing fixture parse rather than a spec diff |
| **The mock server can become a self-consistent fiction** | the mock serves the recorded fixtures |
| **Bindings are private links** and Reader has no `/public/` escape hatch, unlike Linkwarden | cannot be fixed — the link *text* fallback becomes load-bearing (title, then `source_url`, never a bare id), and the limitation goes in the README |
| **One token = full account read/write/delete** | 1.0 writes only `POST /v3/save/`; no `delete()` method is written at all; stated in the README as a promise |
| **Porting `settingsTab.ts` imports a compatibility shim we do not need** | `minAppVersion: 1.13`, declarative settings only |
| **Name collision with the official Readwise plugin** during community review | plugin id `readwise-reader`, "not affiliated" disclaimer at the top of the README, a fallback name agreed before submission |

## Effort estimate

Deliberately not given as a number. What can be said honestly: M-1 is half a day
and gates everything; M0–M1 are mostly mechanical copying; **M2–M3 are the real
work** and have no upstream counterpart; M4–M6 are adaptations of code that
already exists and is already tested. If an estimate is needed, estimate after
M-1 — that is the point at which the highlight-source question is settled and
the sync engine's shape is known.
