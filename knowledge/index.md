# obsidian-linkwarden knowledge

Project knowledge for the Linkwarden Obsidian plugin, in
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
(OKF v0.1): plain markdown with YAML frontmatter, one concept per file. Captures
non-obvious decisions and gotchas that are *not* already recorded in the code,
`CLAUDE.md`, `docs/spec.md`, or git history.

## Dev workflow

* [Obsidian URI vault switching](dev-workflow/obsidian-uri-vault-switching.md) - `obsidian://open?path=` only opens a file in a *known* vault; it does not adopt an unknown folder.
* [obsidian-test launcher](dev-workflow/obsidian-test-launcher.md) - how `nix run .#obsidian-test` opens the example vault on Linux vs macOS, and the new Obsidian CLI pitfall.

## Community plugin review

* [Community plugin checks](plugin-review/community-plugin-checks.md) - the eslint-plugin-obsidianmd setup, sentence-case brand/acronym config, and the settings-API deprecation we cannot act on yet.
