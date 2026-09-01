// The Readwise access token is stored in Obsidian's SecretStorage under this id.
// Secret ids must match `[a-z0-9-]+` (D6); this constant does.
//
// The name of a secret and the secret's value are *both* strings, and Obsidian's
// SecretComponent/SecretStorage type them as plain `string` — which let an
// earlier build swap them (store the returned name as the token → `Token <name>`
// → 401). We give them distinct *branded* types so our own code can no longer
// confuse the two: a TokenValue is not assignable where a SecretName is wanted.
// The `as*` constructors below are the only sanctioned casts and are used only
// at trust boundaries (Obsidian's `string` API, raw user input).

/** A string that *names* a secret in SecretStorage — never the secret's value. */
export type SecretName = string & { readonly __brand: "SecretName" };
/** A secret's plaintext value (e.g. a Readwise access token). */
export type TokenValue = string & { readonly __brand: "TokenValue" };

/** Brand a raw string as a secret name (call only at a trust boundary). */
export function asSecretName(s: string): SecretName {
  return s as SecretName;
}
/** Brand a raw string as a token value (call only at a trust boundary). */
export function asTokenValue(s: string): TokenValue {
  return s as TokenValue;
}
/** The empty token value ("no token"). */
export const EMPTY_TOKEN: TokenValue = "" as TokenValue;

/** SecretStorage id under which the Readwise access token is stored. */
export const TOKEN_SECRET_ID: SecretName = "readwise-token" as SecretName;

const VALID_SECRET_ID = /^[a-z0-9-]+$/;

/** True iff `id` is non-empty and consists only of `a-z`, `0-9` and `-`. */
export function isValidSecretId(id: string): boolean {
  return VALID_SECRET_ID.test(id);
}
