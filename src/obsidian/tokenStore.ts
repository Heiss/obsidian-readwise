// Access-token storage (D6). Prefers Obsidian's SecretStorage (device-local,
// OS-backed, does not enter the synced vault). Falls back to a plaintext value
// in settings for Obsidian < 1.11.5 where SecretStorage is unavailable.

import type { App } from "obsidian";
import {
  asTokenValue,
  isValidSecretId,
  type SecretName,
  type TokenValue,
} from "../core/secretId";

export interface TokenStore {
  /** Whether the OS-backed SecretStorage is available on this device. */
  hasSecretStorage(): boolean;
  /**
   * Read the token *value*, or "" if none. When SecretStorage is available the
   * value is resolved from the configured secret name via `getSecret`; the
   * `SecretComponent` in settings owns writing that value. Otherwise the
   * plaintext fallback is used.
   */
  get(): TokenValue;
  /**
   * Persist the plaintext fallback token. Only used on the no-SecretStorage
   * path — when SecretStorage is available the `SecretComponent` writes the
   * value itself and settings hold only the secret name.
   */
  setFallback(token: TokenValue): void;
}

export function createTokenStore(
  app: App,
  // Reads the current secret name from settings (user-selectable via
  // SecretComponent), so the store always resolves against the live value.
  secretId: () => SecretName,
  fallback: { get(): TokenValue; set(value: TokenValue): void },
): TokenStore {
  const secretStorage = (app as App & { secretStorage?: unknown })
    .secretStorage as
    | {
        getSecret(id: string): string | null;
        setSecret(id: string, value: string): void;
      }
    | undefined;

  const available =
    !!secretStorage && typeof secretStorage.getSecret === "function";

  return {
    hasSecretStorage: () => available,
    get(): TokenValue {
      if (available) {
        const id = secretId();
        if (isValidSecretId(id)) {
          try {
            const v = secretStorage.getSecret(id);
            // Boundary: Obsidian hands back a plain string; it's the token value.
            if (v) return asTokenValue(v);
          } catch {
            // fall through to the plaintext fallback
          }
        }
      }
      // Fallback covers Obsidian < 1.11.5 and a not-yet-populated secret
      // (e.g. the preconfigured demo vault).
      return fallback.get();
    },
    setFallback(token: TokenValue): void {
      fallback.set(token);
    },
  };
}
