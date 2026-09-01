> Not affiliated with Readwise. This plugin is an independent project and has
> nothing to do with Readwise's own development.

# Readwise Reader for Obsidian

**Planned.** An Obsidian community plugin for
[Readwise Reader](https://readwise.io/read): search and link your saved
documents, save URLs to Reader, and show a document's highlights as a **living
reading aid** next to the active note — without materializing them as files.

Guiding principle: **read in Reader, write in Obsidian.** No sync engine for
your notes, no merge/clobber problem.

Setup is one step: create an access token at
<https://readwise.io/access_token>, paste it into the plugin settings, done.

**Status:** the scaffold, the API layer and the token setup (M0–M1) are built and
tested; the index, panel, picker and save flow are next. The design and the build
order live in:

- [docs/spec.md](docs/spec.md) — requirements, the Reader API surface, and
  decisions R1–R9.
- [docs/plan.md](docs/plan.md) — the port map from
  [obsidian-linkwarden](https://github.com/Heiss/obsidian-linkwarden),
  milestones M-1–M7, and the test plan.
- [docs/red-team.md](docs/red-team.md) — what could go wrong, which
  assumptions are load-bearing, and what is still unverified.
- [docs/api-notes.md](docs/api-notes.md) — verified API facts, and the
  checklist that still needs a live token.

This plugin is a port of
[obsidian-linkwarden](https://github.com/Heiss/obsidian-linkwarden) (MIT, same
author) and shares its architecture.

## License

MIT
