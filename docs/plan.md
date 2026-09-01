# Build plan — obsidian-readwise

Companion to [spec.md](spec.md). The spec says *what* and *why*; this file says
*in what order*, *from which file*, and *how it is tested*.

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
| `quote.ts` | adapt | id type `number` → `string`; block-id prefix `lw-` → `rw-`; `hasBlockId` boundary guard becomes `(?![0-9a-z])`; blank-line separator logic unchanged |
| `secretId.ts` | verbatim | branded `SecretName` / `TokenValue`; constant → `readwise-token` |
| `urls.ts` | **adapt (rewrite)** | one fixed host; `buildDeepLink(id)` → `https://read.readwise.io/read/<id>`; `parseBindingId(href)` matches `/read/<26-char ULID>` case-insensitively, tolerant of query/fragment/trailing slash. The three-target `DeepLinkTarget` union is deleted |
| `colorMap.ts` | adapt | becomes `semanticsMap.ts`: tag → `{ callout, tag? }`, plus a `*` default rule (R6) |
| `cache.ts` | **deleted** | superseded by the index (F7) |
| `rateLimit.ts` | **new** | token bucket, injectable `now()`, `acquire()` returning a delay; separate buckets for read (20/min) and create (50/min) |
| `index.ts` | **new** | the persisted index: shape, merge-a-page, group-by-`parent_id`, attach notes to highlights, fuzzy search over docs, sort |
| `sync.ts` | **new** | pure sync driver: given a "fetch page" function and a cursor, produce the sequence of requests and the resulting index mutations. Pure so the whole sync is unit-testable with a fake clock and fake pages |

### `src/api/`

| File | Action | Notes |
| --- | --- | --- |
| `http.ts` | **verbatim** | the `HttpClient` contract (resolve on any status, reject only on transport failure) is exactly what the 200-vs-201 and 429 paths need |
| `schema.ts` (generated) | **deleted** | no upstream OpenAPI (R9) |
| `models.ts` | **adapt (rewrite)** | hand-written `ReaderDocument`, `Highlight`, `SaveDocumentBody`, `ListResponse<T>`; required-field narrowing kept in the same style |
| `client.ts` | adapt | same shape, new calls: `checkConnection()` (`GET /v2/auth/` → 204), `listDocuments({category, location, tag, updatedAfter, pageCursor})`, `getDocument(id)`, `save(body)` returning `{ document, alreadyExisted }` from the 201/200 split. Wrapped by the rate limiter. `search()`, `getCollections()`, `recent()` and `createLink()`'s duplicate machinery are gone |

### `src/obsidian/`

| File | Action | Notes |
| --- | --- | --- |
| `httpAdapter.ts` | verbatim | `requestUrl` with `throw: false`, guarded `res.json` |
| `tokenStore.ts` | verbatim | SecretStorage + plaintext fallback |
| `secretComponent.ts` | verbatim | the `SecretName`-typed wrapper |

### `src/ui/`

| File | Action | Notes |
| --- | --- | --- |
| `settingsTab.ts` | adapt | keep the dual declarative (`getSettingDefinitions`, Obsidian ≥ 1.13) / imperative (`display()`, < 1.13) structure verbatim. Rows change: token, connection test, default location, default tags, semantics map, index scope, sync controls. Base URL / deep-link target / collection / cache TTL rows are deleted |
| `picker.ts` | adapt | `SuggestModal` over the local index instead of a network search; empty query → most-recently-updated; unmatched URL → "Save to Reader" |
| `panel.ts` | adapt | same `ItemView`, same toolbar, same insert-at-cursor and reading-mode handling. Source of highlights changes from `client.getHighlights(id)` + TTL cache to an index lookup + optional delta sync |
| `exportModal.ts` | adapt | same checkbox modal and vault-scan; per-export **location + tags** controls replace the collection dropdown; progress line driven by the rate limiter |
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

**M0 — Scaffold.** Repo skeleton, build/test/lint tooling, CI + release
workflows, `manifest.json`, empty plugin that loads. Port `core/links.ts`,
`core/exportPlan.ts`, `core/binding.ts` and their tests verbatim as the first
proof the toolchain works. _No Readwise code yet._

**M1 — API layer + setup UX.** `api/http.ts`, `api/models.ts`, `api/client.ts`,
`core/rateLimit.ts`, `obsidian/tokenStore.ts`, `obsidian/secretComponent.ts`,
`core/secretId.ts`, `settings.ts`, and the settings tab reduced to **token +
connection test**. This is the milestone that delivers the headline UX: paste a
token, press "Test connection", see "Connected". **Resolve the eight open
questions in the spec here**, with a real token, and record the answers in
`docs/api-notes.md` plus `tests/fixtures/`.

**M2 — Index + sync (F7).** `core/index.ts`, `core/sync.ts`, the mock server,
and the sync controls in settings. Full first sync with progress and cancel,
`updatedAfter` deltas, rebuild. Nothing user-visible yet beyond settings, but
everything after this is cheap.

**M3 — F1 picker.** `ui/picker.ts` over the index, plus `core/urls.ts` and the
binding insert. First end-to-end user value.

**M4 — F2 panel.** `ui/panel.ts`, `extractBindings` wired to the ULID parser.
The core of the product.

**M5 — F3 save/export.** `ui/exportModal.ts`, `ui/save.ts`, location + tags,
throttled batch with progress.

**M6 — F4 insert as quote.** `core/quote.ts`, `core/semanticsMap.ts`, the map
editor in settings, duplicate-block-id protection. **Confirm R6 first** — if
highlights turn out to carry a colour, this is a colour map instead and the
settings row is unchanged from the Linkwarden plugin.

**M7 — F5 re-link, i18n, docs, release.** `ui/relink.ts`, `i18n/en.ts` +
`de.ts`, README (usage / setup / network-use & privacy sections mirroring the
Linkwarden README), `example-vault` polish, the community-plugin checklist from
`knowledge/`, first tagged release.

_Optional afterwards:_ F6 browsable tab; R3b colour enrichment via
`/v2/export/`; `PATCH /v3/update/` to move a document to `archive` from
Obsidian.

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
| `urls.test.ts` | rewritten | ULID parse: valid, wrong host, wrong length, query/fragment/trailing slash, uppercase |
| `quote.test.ts` | adapted | callout rendering, note line, block-id placement, ULID boundary |
| `semanticsMap.test.ts` | adapted | tag → callout/tag, default rule, unknown key |
| `client.test.ts` | adapted | fake `HttpClient`: auth header shape, **201 vs 200 on save**, `nextPageCursor` paging, 4xx error text, **429 + `Retry-After`** |
| `rateLimit.test.ts` | new | token bucket with an injected clock: burst, refill, two independent buckets |
| `index.test.ts` | new | merge a page, group highlights by `parent_id`, attach notes to highlights, fuzzy search ranking, sort by `created_at` |
| `sync.test.ts` | new | full pull over N fake pages, delta by `updatedAfter`, cancel mid-run, cursor persistence, resume after failure |
| `fixtures.test.ts` | new | parse the recorded redacted responses in `tests/fixtures/` into the hand-written models — the R9 replacement for the OpenAPI drift test |

Manual end-to-end runs go through `example-vault/` + the mock server, exactly as
upstream (`node example-vault/mock-readwise/server.mjs`, then open the vault).

## Risks and how the plan absorbs them

| Risk | Mitigation |
| --- | --- |
| **No search API** → the picker needs a local index before it can exist | F7 is scheduled as its own milestone (M2) *before* the picker, rather than discovered inside M3 |
| **No per-parent highlight endpoint** → the panel cannot lazily fetch one source | same: the panel reads the index; a "refresh" is a delta sync, not a per-source GET |
| **First sync is slow for large libraries** at 20 req/min | progress + cancel from the start; index-scope setting to skip `feed`; delta syncs afterwards are one or two requests |
| **`data.json` growth** | store only UI-needed fields; document the ~200 B/doc figure; never store `html_content` |
| **No OpenAPI spec** → silent upstream drift, which the Linkwarden plugin caught automatically | fixture contract tests + a dated `docs/api-notes.md`; accept that drift is found by a failing fixture parse, not by a spec diff |
| **Highlight colour may not exist in v3** | R6 is provisional and gated on M1's verification; R3b (v2 export) is the fallback that restores colours |
| **One token = full account read/write** | only one write path exists (`/v3/save/`), stated plainly in the README's network-use section |
| **Name collision / trademark** with the official Readwise plugin | plugin id `readwise-reader`, name "Readwise Reader"; README opens with the same "not affiliated" disclaimer the Linkwarden plugin uses; positioning ("living reading aid", no file materialization) is the honest differentiator from the official plugin's export-to-files model |

## Effort estimate

Roughly comparable to the source plugin's own build, minus the parts that copy
across, plus F7. M0–M1 are mostly mechanical; M2 is the genuinely new work;
M3–M7 are adaptations of code that already exists and is already tested.
