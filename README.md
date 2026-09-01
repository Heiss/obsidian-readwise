> Not affiliated with Readwise. This plugin is an independent project and has
> nothing to do with Readwise's own development.

# Readwise Reader for Obsidian

**The [Readwise Reader](https://readwise.io/read) plugin for Obsidian.** Link
your saved documents, and see their highlights as a **living reading aid** next
to the active note — without materializing them as files. Guiding principle:
**read in Reader, write in Obsidian.**

No sync engine for your notes, no merge/clobber problem. A note is bound to a
Reader document by a single Markdown link whose href carries the document id;
the id in the href *is* the binding, and it survives you triaging the document
in Reader.

Setup is one step: paste an access token.

## Usage

1. **Sync.** **Settings → Readwise Reader → Sync now.** The first sync pulls
   your highlight history; after that it is a delta of one or two requests.
2. **Open the highlight panel.** The **highlighter** icon in the left ribbon, or
   **Readwise Reader: Open highlight panel** from the command palette. It docks
   on the right and tracks whichever note is active.
3. **Link a note to a source.** With the cursor where you want the link, run
   **Readwise Reader: Link a source (search)** (also the 🔍 in the panel
   toolbar). Search runs against the local index, so it is instant and works
   offline.
4. **Read its highlights.** The panel scans the active note for Reader links and
   lists each source's highlights in reading order, colour-coded by your tag
   rules, with your Readwise notes underneath.
5. **Insert a highlight as a quote.** Each highlight has an **Insert as quote**
   button that drops it into the note at the cursor as a callout with a
   referenceable block id (`^rw-<id>`), so `[[source#^rw-1572]]` works.

## Setup

1. Create an access token at <https://readwise.io/access_token>.
2. In Obsidian, open **Settings → Readwise Reader** and paste it. That is the
   whole configuration — there is no base URL, because Readwise is a single
   hosted service.
3. Press **Sync now**.

The token is stored in Obsidian's **secret storage** (device-local, OS-backed),
so it never enters your synced vault — which also means you enter it once per
device. Requires Obsidian **≥ 1.13**; on Linux an OS secret backend
(kwallet/libsecret) must be available, otherwise the plugin falls back to
storing it in its data file inside the vault and says so.

## Colours come from your tags

Readwise exposes no highlight colour through its API, so the plugin derives
colour from **tags**: you say which tag means which colour, and anything
unmatched gets your default colour.

Rules are an **ordered list and the first match wins** — a highlight can carry
several tags, so the order is how you say which one should decide. A highlight's
own tags are checked before its source's, so tagging a whole document still
works if you do not tag individual highlights.

Each rule also sets the Obsidian **callout type** used when you insert that
highlight as a quote, which is how your Readwise tags turn into searchable vault
semantics.

## Honest limitations

- **Bindings are private links.** A `read.readwise.io` URL needs your login, and
  Reader has no public-link equivalent. In a shared or published vault the link
  is dead for everyone but you — which is why the visible link text is always a
  real title or URL, never a bare id.
- **Deletions are invisible until you rebuild.** Readwise's incremental API does
  not report deleted highlights, so a highlight deleted in Readwise stays in the
  panel until you press **Rebuild index**.
- **Not everything can be linked.** The highlight export covers your whole
  Readwise library — Kindle books, podcasts, manually added highlights — but only
  Reader documents have a URL to bind to. The rest are reported as skipped.
- **One token, whole account.** Readwise issues no scoped or read-only tokens.
  This plugin only ever *saves* documents; it contains no delete call at all.

## Network use & privacy

This plugin talks to exactly one remote service: **readwise.io**.

- No request is made until you enter an access token.
- Sent to Readwise: your access token (as a `Token` header), and — when you save
  a URL — that URL. Nothing else leaves your vault.
- Rate limits are per token and shared with whatever else you run against
  Readwise (the official plugin, the MCP server, a CLI), so the plugin
  deliberately budgets below the published limits and absorbs a 429 rather than
  surfacing it.
- No telemetry, no other servers. Using it requires a Readwise account.

## Development

```bash
npm install
npm run dev        # esbuild watch → main.js
npm run build      # typecheck + production bundle
npm test           # vitest (unit tests for all pure logic)
npm run lint       # eslint-plugin-obsidianmd
```

`example-vault/` is a ready-to-run vault pointed at a bundled mock server:

```bash
node example-vault/mock-readwise/server.mjs
```

The mock serves `tests/fixtures/`, the same files the unit tests parse — so a
mock that drifts from reality cannot quietly keep the suite green.

### Design

- [docs/spec.md](docs/spec.md) — requirements, the API surface, decisions R1–R12.
- [docs/plan.md](docs/plan.md) — the port map from
  [obsidian-linkwarden](https://github.com/Heiss/obsidian-linkwarden) and the
  milestone order.
- [docs/red-team.md](docs/red-team.md) — what could go wrong and which
  assumptions are load-bearing.
- [docs/api-notes.md](docs/api-notes.md) — verified API facts, and the checklist
  that still needs a live token.

This plugin is a port of
[obsidian-linkwarden](https://github.com/Heiss/obsidian-linkwarden) (MIT, same
author) and shares its architecture.

## License

[MIT](LICENSE)
