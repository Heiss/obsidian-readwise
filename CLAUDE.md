# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Obsidian community plugin for [Readwise Reader](https://readwise.io/read),
ported from [obsidian-linkwarden](https://github.com/Heiss/obsidian-linkwarden).
Guiding principle: **read in Reader, write in Obsidian.** Highlights are shown as
a *living reading aid* beside the active note rather than materialized as files —
so there is deliberately **no sync engine for notes and no merge/clobber
problem**.

Setup is one step: paste a Readwise access token. There is no base URL, because
Readwise is a single hosted service.

The design rationale and the decisions R1–R12 live in [docs/spec.md](docs/spec.md);
the build order is [docs/plan.md](docs/plan.md); what could go wrong and which
assumptions are load-bearing is [docs/red-team.md](docs/red-team.md); verified
API facts and the open checklist are [docs/api-notes.md](docs/api-notes.md).
Read the spec before changing binding, token storage, colour rules or sync.

## Commands

```bash
npm run dev        # esbuild watch → main.js
npm run build      # tsc typecheck (noEmit) THEN production bundle
npm run typecheck  # tsc -noEmit -skipLibCheck only
npm run lint       # eslint-plugin-obsidianmd (community-plugin rules)
npm test           # vitest run (all tests under tests/)
npm run test:watch # vitest (watch mode)

npx vitest run tests/urls.test.ts        # a single file
npx vitest run -t "parseBindingId"       # a single test
```

## Architecture

The binding is the whole design: a note is linked to a Reader document by a
single Markdown link whose href carries the document id. **The id in the href IS
the binding** — the single source of truth. The visible link text is only a
human-readable fallback. Preserve this invariant when touching link insertion,
parsing or rewriting.

Reader document URLs embed the document's *triage location*
(`/new/read/<id>`, `/archive/read/<id>`), which changes when the user triages it.
So `core/urls.ts` is deliberately asymmetric: **build** the canonical
location-free form, **parse** permissively. Ids are opaque and **not
fixed-length** — never assume 26 characters.

Two hard rules shape the code:

- **`src/api/` and `src/core/` must stay free of any Obsidian import.** This is
  what keeps them unit-testable. Obsidian is only touched in `src/main.ts`,
  `src/ui/` and `src/obsidian/`.
- **HTTP goes through Obsidian's `requestUrl`, never `fetch`** — it bypasses CORS
  at the Electron level. The client depends on an injected `HttpClient`
  (`src/api/http.ts`) so tests pass a fake; the real one is `obsidianHttp`.
  `HttpClient` implementations MUST resolve for any status (including 4xx/5xx)
  and reject only on transport failure — the client interprets status codes
  itself (the 201-vs-200 save split, the 429 retry).

### Two APIs, one token

- **Reader v3** (`/api/v3/`) — documents: `list/`, `save/`, `tags/`.
- **Readwise v2** (`/api/v2/`) — `auth/` for the token check, and `export/` as
  the **highlight source**. The export returns highlights *nested inside their
  book*, so its cost scales with sources-you-have-highlighted rather than with
  the number of highlights; Reader's own `category=highlight` documents are not
  used at all. See R3 in the spec.

Rate limits are per token *and shared with whatever else the user runs against
Readwise* (the official plugin, the MCP server, a CLI). So `core/rateLimit.ts`
budgets **below** the published limits, and a 429 is normal traffic to absorb,
not an error to surface.

### Colour comes from tags

Readwise exposes no highlight colour. `core/colorRules.ts` is an **ordered list,
not a keyed map**: a highlight can carry several tags, so first-match-in-user-order
wins and the settings UI must keep the reorder buttons. Highlight tags are
checked before the source's tags.

### Persistence & secrets

`data.json` holds **settings only**. The index (documents + highlights) gets its
own file, because `data.json` is parsed synchronously on load, rewritten whole on
every save, and syncs with the vault — a library-sized blob there is a startup
stall and a sync-conflict generator.

The **access token is never in `data.json`**: it goes to Obsidian's OS-backed
`SecretStorage`, with only a secret *id* in settings. `core/secretId.ts` brands
`SecretName` and `TokenValue` as distinct types precisely so the two cannot be
swapped (doing so produces `Token <name>` → 401). `tokenStore.ts` falls back to a
plaintext `tokenFallback` when SecretStorage is unavailable.

### Settings tab

Declarative only (`getSettingDefinitions()`, Obsidian ≥ 1.13). The upstream
plugin carries a second imperative implementation for older Obsidian; this one
does not, and `minAppVersion` is 1.13 so it never needs to.

## Status

M0 (scaffold + pure logic) and M1 (API layer, rate limiting, token storage,
settings UX) are done. M2 onward — the index, sync, panel, picker, save/export —
are specified in `docs/plan.md` and not yet built.
