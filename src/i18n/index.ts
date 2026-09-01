// Lightweight i18n layer. Obsidian has no plugin-facing translation API, so we
// keep a small per-locale string dictionary (see `en.ts`, the source of truth,
// and `de.ts`) and pick one based on Obsidian's display language. Callers reach
// strings through `t()`, e.g. `t().panel.loading` or `t().picker.archived(id)`.
//
// The active locale is resolved once (in `initI18n`, called from `main.onload`
// with Obsidian's `getLanguage()`) because Obsidian only changes its display
// language across an app reload. This module takes the locale as a plain string
// and never imports `obsidian`, so it — and the dictionaries it re-exports —
// stays unit testable, matching the repo's core/api convention. Until `initI18n`
// runs, `t()` returns English.

import { en, type Messages } from "./en";
import { de } from "./de";

export type { Messages } from "./en";

const LOCALES: Record<string, Messages> = { en, de };

let current: Messages = en;

/**
 * Select the active locale from a language code (e.g. Obsidian's
 * `getLanguage()`). Falls back to English for any unknown or empty language.
 */
export function initI18n(locale: string): void {
  current = LOCALES[locale] ?? en;
}

/** The active locale's string table. */
export function t(): Messages {
  return current;
}
