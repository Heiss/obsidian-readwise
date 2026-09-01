---
type: Decision
title: Community plugin checks
description: How this repo enforces the Obsidian community-plugin guidelines, and the one class of lint warning that cannot be fixed yet.
tags: [obsidian, lint, eslint, plugin-review]
timestamp: 2026-07-21T00:00:00Z
---

# Community plugin checks

The repo lints against the official
[`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin-obsidianmd)
recommended ruleset via `npm run lint` (also run in CI). Config lives in
`eslint.config.mjs`.

## Sentence-case rule needs a brand/acronym override

`obsidianmd/ui/sentence-case` ships a brand + acronym dictionary but does not
know this project's terms, and its default brand list **includes "Cursor"** (the
editor). Without overrides it wrongly wants to lowercase "Linkwarden"/"TTL" and
capitalize our text-"cursor". The config therefore extends the rule:

- add `Linkwarden`, `Unorganized` (Linkwarden's built-in default collection) to
  `brands`
- add `TTL` to `acronyms`
- **remove `Cursor`** from `brands` (here "cursor" always means the text cursor)

## Do NOT chase the getSettingDefinitions warnings yet

Three lint warnings remain and are **expected**: the
`obsidianmd/settings-tab/prefer-setting-definitions` nudge plus two
`@typescript-eslint/no-deprecated` hits on `PluginSettingTab.display()`. All
three want migration to the declarative `getSettingDefinitions()` settings API.

That API was introduced in **Obsidian 1.13.0, which is not yet released** (stable
is 1.12.7). Setting `minAppVersion: 1.13.0` would make the plugin
**uninstallable for everyone**, and calling the API on 1.12.7 does nothing. So
`display()` is correct for now; migrate only once 1.13.0 ships. A full
declarative rewrite of `src/ui/settingsTab.ts` was drafted and reverted for this
reason.
