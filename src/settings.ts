// Plugin settings shape and defaults. The access-token *value* is NOT stored
// here — it lives in Obsidian's SecretStorage. Settings hold only the secret's
// *name* (`tokenSecretId`, what `SecretComponent` manages), plus a plaintext
// fallback for Obsidian versions without SecretStorage.
// Kept obsidian-free so the defaults/merge logic is unit-testable.

import {
  EMPTY_TOKEN,
  TOKEN_SECRET_ID,
  type SecretName,
  type TokenValue,
} from "./core/secretId";
import {
  DEFAULT_COLOR,
  DEFAULT_COLOR_RULES,
  type ColorRule,
  type ResolvedColor,
} from "./core/colorRules";
import type { ReaderLocation, WritableLocation } from "./api/models";

export interface ReadwiseSettings {
  /**
   * Name of the SecretStorage secret holding the access token. This is what
   * `SecretComponent` reads/writes (the component owns the value; we only keep
   * the name). The token value is fetched at runtime via `getSecret(name)`.
   */
  tokenSecretId: SecretName;
  /** Plaintext token fallback for Obsidian without SecretStorage. */
  tokenFallback: TokenValue;
  /**
   * API base. Not surfaced in the UI — Readwise is a single hosted service, and
   * that is exactly what makes the setup one step. It exists so the example
   * vault can point at the bundled mock server.
   */
  apiBase: string;
  /** Where F3 files newly saved documents. `shortlist` is not settable. */
  defaultLocation: WritableLocation;
  /** Tags applied to documents saved by F3. */
  defaultTags: string[];
  /** Ordered colour rules (R6); first match wins. */
  colorRules: ColorRule[];
  /** Applied to any highlight matching no rule. */
  defaultColor: ResolvedColor;
  /** Whether to build the opt-in tier-2 document index (R12). */
  indexAllDocuments: boolean;
  /** Which locations tier 2 covers. `feed` is excluded by default: it is the
   * largest and least note-worthy bucket, and the one that makes a first sync
   * expensive. */
  indexedLocations: ReaderLocation[];
}

export const DEFAULT_SETTINGS: ReadwiseSettings = {
  tokenSecretId: TOKEN_SECRET_ID,
  tokenFallback: EMPTY_TOKEN,
  apiBase: "https://readwise.io/api",
  defaultLocation: "new",
  defaultTags: [],
  colorRules: DEFAULT_COLOR_RULES,
  defaultColor: DEFAULT_COLOR,
  indexAllDocuments: false,
  indexedLocations: ["new", "later", "shortlist", "archive"],
};

/** Merge persisted (possibly partial/legacy) data over the defaults. */
export function mergeSettings(
  data: Partial<ReadwiseSettings> | null | undefined,
): ReadwiseSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(data ?? {}),
    // Nested values must be replaced wholesale but never left partial: an empty
    // rule list is a legitimate user choice (all highlights get the default
    // colour), so `??` rather than a truthiness check.
    colorRules: data?.colorRules ?? DEFAULT_SETTINGS.colorRules,
    defaultColor: { ...DEFAULT_COLOR, ...(data?.defaultColor ?? {}) },
    defaultTags: data?.defaultTags ?? [],
    indexedLocations: data?.indexedLocations ?? DEFAULT_SETTINGS.indexedLocations,
  };
}
