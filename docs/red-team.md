# Red team — where this plan breaks

_Companion to [spec.md](spec.md) and [plan.md](plan.md). Written 2026-09-01,
after the official Reader API docs were checked in._

Nothing here is a reason not to build the plugin. It is the list of things that,
left unexamined, turn into a half-finished port with a slow startup and a panel
the user quietly stops trusting. Ordered by what it costs to be wrong.

---

## 1. Assumptions that can sink the project

### A1 — That highlight text is retrievable in bulk from the Reader API 🔴 blocking

**The assumption.** `GET /v3/list/?category=highlight` returns the highlighted
text in a field (third-party clients say `content`).

**The evidence.** None, directly. The official docs' example response shows only
article and RSS documents, and **no field in the documented list is the
highlighted text**. `notes` is the document-level note. `summary` is a summary.
The field is simply not documented.

**If it is false**, F2 — the entire product — cannot be built on v3, and the
plugin becomes a Readwise-v2-export client wearing a Reader badge. Every
milestone from M2 onward changes.

**What the plan gets wrong:** it verifies this in M1. That is one milestone too
late. **This must be answered before M0 is started** — it is one request with one
token, and it decides the architecture.

### A2 — That the first sync is fast enough to hide behind a progress bar 🔴 contradicts the headline UX

**The assumption.** A full index costs ~50 requests ≈ 2½ minutes.

**The arithmetic that was not done.** That is a 5 000-document library. Reader
users with RSS feeds routinely carry tens of thousands of documents, and highlights
are *also* documents. 50 000 documents + 20 000 highlights + notes ≈ 700 requests
at **20/min = 35 minutes**, and it lands immediately after the user pastes their
token — precisely the moment the product promises "ready to go".

**This is the single biggest threat to the stated UX goal.** The Linkwarden
plugin never had it, because it fetched one source's highlights on demand.

**Options, in order of preference:**

1. **Split the sync.** Documents first (picker works in ~1 minute), highlights in
   the background afterwards. The user gets F1 immediately and F2 fills in.
2. **Reconsider R3b as the *primary* highlight source, for economics rather than
   colour.** `GET /v2/export/` returns highlights **nested inside their book**,
   so one request carries a whole document's highlights instead of one per
   highlight page. For a heavy highlighter this is plausibly an order of
   magnitude fewer requests — and it also happens to restore `color`,
   `highlighted_at` and a real sort key. The cost is a URL-based join and a
   second API surface. _This deserves a measurement in M1, not a guess: pull page
   one of each and compare request counts for the same library._
3. **Scope the default index harder** — `feed` excluded is in the plan; consider
   also defaulting to "documents you have highlighted" if that is expressible.

### A3 — That the index can live in `data.json` 🟠 startup and sync damage

**The assumption.** Persist `{ settings, index }` via `saveData()`, as the
Linkwarden plugin persists its cache.

**Why it does not transfer.** Linkwarden's cache held highlights for the handful
of sources in one note. This index holds the user's whole library.

- `loadData()` parses the entire JSON **on plugin load**. A 10 MB `data.json` is
  a visible Obsidian startup stall and a community-review objection.
- `saveData()` rewrites the whole file. The Linkwarden panel calls `saveCache()`
  after *every* refresh; at 10 MB that is a stall per note switch.
- `data.json` lives in the vault, so it **syncs**. Two devices each writing an
  index produce Obsidian Sync / Nextcloud conflict files on a multi-megabyte
  JSON blob.

**Unresolved trade-off the plan silently assumed away:** an index in the vault
arrives on every device for free (no re-sync on mobile — genuinely valuable,
since the token is device-local and must be entered per device anyway); an index
outside the vault avoids the bloat and the conflicts but makes every device pay
the A2 first-sync cost.

**Recommendation:** index in a **separate file** in the plugin folder (not
`data.json`), written **debounced**, with settings staying in `data.json`. Then
let the user choose whether that folder is excluded from sync, and say so in the
README. Decide this before M2 — it is not a refactor you want after the sync
engine exists.

### A4 — That the index is derived state, so losing it is harmless ✅ holds, and should be stated

Worth writing down as a *safety property*, because it makes several other risks
cheap: the index contains nothing the user authored. Corrupt it, delete it,
change its schema — the fix is always "rebuild". No migration code, no data loss,
no merge logic. Every design decision that keeps this true is worth defending;
the moment anything user-authored lands in the index, that changes.

---

## 2. Assumptions that produce quiet, hard-to-debug wrongness

### A5 — That `updatedAfter` deltas see everything 🟠 silent staleness

The plan syncs highlights by `updatedAfter`. That is correct only if a
highlight's `updated_at` moves whenever anything the panel displays changes —
including when a **note child** is added or edited, which is a *different*
document. If a note is created without touching its parent highlight's
`updated_at`, delta syncs will show the highlight without the note, indefinitely,
with no error.

For a "living reading aid", **silently stale is worse than visibly broken** — the
user stops trusting the panel and cannot say why.

- Sync `category=note` with its own independent cursor (the plan does this —
  keep it, and make sure the two cursors are never collapsed into one).
- Deletions are not reported by `updatedAfter` at all. A highlight deleted in
  Reader stays in the panel forever until a rebuild. The "rebuild index" button
  is therefore not a nicety, it is the only correctness backstop — surface it,
  and consider a periodic automatic full rebuild.

### A6 — That "no highlights" and "not synced yet" are distinguishable 🟠 design gap

In the index shape as specified, `highlightsByParent[id]` being absent means both
"this document has no highlights" and "we have not synced this document's
highlights yet". The panel cannot tell the user which — so during and after a
partial or cancelled sync it will confidently render "No highlights yet" for
documents that have plenty.

**Missing from the design:** a per-document (or at least global) highlight-sync
watermark, and a cancel/resume-safe cursor persisted *with* the index. The test
plan mentions "cancel mid-run" and "resume after failure"; the data structure it
would test does not exist yet.

### A7 — That the `parent_id` chain is always article ← highlight ← note 🟡

Orphans are not handled anywhere in the plan: a highlight whose parent was
deleted, a note whose highlight was deleted, or a `read.readwise.io` link in the
user's note pointing at a document that isn't theirs (copied from a colleague).
Each needs a defined rendering. Today each is an undefined lookup miss.

### A8 — That URL dedup on save is good enough 🟡

`POST /v3/save/` is idempotent **by URL**. The docs do not say whether Readwise
normalizes anything. Linkwarden at least normalized trailing slash and `www`, and
its spec still admits tracking-param variants slip through. So the same article
saved from a note with `?utm_source=newsletter` and later without it becomes two
Reader documents, and F3's "already bound" check — which compares hrefs, not
source URLs — will not notice. Verify Readwise's behaviour; if it is strict,
consider stripping common tracking params before saving, and say so.

---

## 3. A UX regression the port inherits without noticing

### A9 — Bindings are private links, and Reader has no public escape hatch 🟠

Linkwarden's spec confronted this (D1) and answered it: make the collection
public, use `/public/links/<id>`. **Reader has no equivalent.**
`read.readwise.io/…/read/<id>` requires the owner's login, full stop.

So in a shared or published vault, every binding is a dead link for everyone but
the author. The visible link text is the fallback — which is exactly why R1's
"text is a readable fallback" rule must be treated as load-bearing rather than
decorative: **prefer the document title, and fall back to `source_url`, never to
a bare id.** Arguably F1 should insert the *original* article URL as the link and
carry the Reader id elsewhere — but that breaks the single-source-of-truth
invariant that makes this whole design simple, so: keep the invariant, and state
the limitation in the README rather than discovering it in an issue.

Related and smaller: a lapsed Reader subscription leaves every binding dead while
the notes stay readable. Acceptable, but it belongs in the README's honesty
section next to the token-scope warning.

---

## 4. Where the port itself is the risk

### A10 — Copying `settingsTab.ts` wholesale imports complexity we do not need 🟡

The upstream settings tab carries a **dual declarative/imperative implementation**
so it works both above and below Obsidian 1.13. That shim exists because
obsidian-linkwarden shipped with a `minAppVersion` of 1.12.7 and has installed
users. A brand-new plugin has neither. Setting `minAppVersion: 1.13` and writing
only `getSettingDefinitions()` deletes roughly half of the largest UI file and
all of its dual-path drift risk.

The plan says "port verbatim, keep the dual structure". That is the wrong default
for a greenfield repo. **Port the *hard* parts (the `SecretComponent` pattern,
the branded types, the rerender dance) and drop the compatibility layer.**

More generally: the port copies both upstream's solutions and its open problems —
`knowledge/plugin-review/` explicitly records a settings-API deprecation it
"cannot act on yet". Inheriting a known-stale workaround without inheriting the
constraint that forced it is how ported code rots.

### A11 — Community-plugin review is a real gate, and the name is exposed 🟡

An official Readwise plugin already exists (`readwise-official`). A community
plugin called "Readwise Reader" may be asked to rename, and the review will also
look at startup cost (A3) and at what a plugin does with an unscoped account
token (§5). Have a fallback name ready rather than discovering it during review,
and keep the "not affiliated" disclaimer at the top of the README where upstream
puts it.

Minor but real: this repo copies substantial code from obsidian-linkwarden. Same
author, same MIT license, so there is no license problem — but the README should
say it is a port, both as attribution and because it explains the architecture.

### A12 — The mock server can become a self-consistent fiction 🟡

Every test and every manual run goes through `example-vault/mock-readwise`. If
the mock's idea of a highlight document is wrong (see A1), the whole suite passes
green against a shape that does not exist. **Tie the mock's responses to the
recorded fixtures in `tests/fixtures/`** — same JSON, one source — so that
correcting a fixture corrects the mock automatically.

---

## 5. Operational and trust risks

- **The token is unscoped.** One Readwise token grants full read/write/delete to
  the whole account. R11 (save only; never `DELETE`) is the right restraint; it
  should be stated in the README as a promise, not buried as an implementation
  detail, and it should be enforced by *not writing a delete call at all* rather
  than by not calling one.
- **Rate limits are per token, shared with everything else the user runs** — the
  official plugin, the Readwise MCP server, the CLI, Zapier. Our throttle only
  sees our own traffic, so `429` is a **normal** response to be absorbed
  gracefully, not an exceptional one. A 35-minute first sync (A2) will also
  starve the user's other integrations for that whole window. Budget below the
  limit rather than up to it.
- **Repeated "Sync now" clicks** must coalesce into one in-flight sync. Trivial
  to get wrong, produces a rate-limit pile-up that outlives the click.
- **Scraping failures are not ours but will be reported as ours.** F3 saves a URL
  and Reader scrapes it asynchronously; some pages fail. The document then exists
  with no content and never produces highlights. The export modal should say what
  "saved" does and does not guarantee.

---

## 6. What is genuinely still unclear

Ranked by how much rides on the answer.

1. **Which field carries highlight text** (A1) — blocking, one request to settle.
2. **Whether v2 export beats v3 list on sync economics** (A2) — decides the
   primary highlight source; needs a measurement, not an opinion.
3. **Where the index lives** — synced `data.json`, or a separate device-local
   file (A3). Decide before M2.
4. **Whether the location-free `read.readwise.io/read/<id>` URL resolves** — only
   affects which string is written into notes; the permissive parser (R10) makes
   the plugin correct either way.
5. **Whether a highlight's `tags` are its own or inherited from its parent** —
   decides whether F4's semantics map keys off the highlight or the document.
6. **Whether Readwise normalizes URLs on save** (A8).
7. **Whether Reader documents appear in `/v2/export/` with a joinable
   `unique_url`** — only if R3b is taken; but see (2), which may promote it.
8. **What "Refresh" in the panel means** when there is no per-source fetch. A
   full delta sync behind one button press is a surprising amount of work for a
   click; scoping it to "the bound documents in this note" is impossible via the
   API. Unresolved UX, not just unresolved code.
9. **Mobile.** `isDesktopOnly: false` is inherited, unexamined. First sync, index
   size and SecretStorage availability on iOS/Android are all unknown.
10. **German i18n for the new sync vocabulary** — no glossary decided; upstream's
    key-parity test will fail loudly, which is the right kind of unclear.

---

## 7. Changes to the plan this analysis forces

1. **Add M-1, a verification spike, before M0.** One token, ~10 requests, half a
   day: settle §6 items 1, 2, 4, 5, 6, and record them in `docs/api-notes.md` +
   `tests/fixtures/`. Everything downstream is cheaper afterwards, and one of the
   answers can still change the architecture.
2. **Re-sequence M2/M3 so the picker ships on a documents-only index.** Highlights
   sync in the background. This removes the long unrewarding middle of the plan
   *and* fixes the onboarding cliff in A2.
3. **Move the index out of `data.json`**, debounce its writes, and decide the
   sync-or-not question explicitly (A3).
4. **Add a highlight-sync watermark and a persisted resume cursor to the index
   shape** (A6), before writing `sync.ts`.
5. **Do not port the settings-tab compatibility shim**; raise `minAppVersion` to
   1.13 instead (A10).
6. **Derive the mock server from the fixtures** (A12).
7. **Add a README section on the three honest limitations**: bindings are private
   links (A9), the token is unscoped (§5), and highlights appear in creation
   order because the API exposes no offsets (R8).
