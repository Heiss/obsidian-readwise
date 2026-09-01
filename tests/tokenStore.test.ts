import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { createTokenStore } from "../src/obsidian/tokenStore";

// A minimal fake of Obsidian's SecretStorage keyed by name → value.
function fakeApp(
  secrets: Record<string, string>,
  opts: { throwOnGet?: boolean } = {},
): App {
  return {
    secretStorage: {
      getSecret(id: string): string | null {
        if (opts.throwOnGet) throw new Error("boom");
        return secrets[id] ?? null;
      },
      setSecret(id: string, value: string): void {
        secrets[id] = value;
      },
    },
  } as unknown as App;
}

function makeFallback(initial = "") {
  let value = initial;
  return {
    get: () => value,
    set: (v: string) => {
      value = v;
    },
  };
}

describe("createTokenStore (SecretStorage available)", () => {
  it("resolves the token value from the configured secret name", () => {
    const app = fakeApp({ "linkwarden-token": "real-token" });
    const store = createTokenStore(app, () => "linkwarden-token", makeFallback());
    expect(store.hasSecretStorage()).toBe(true);
    // The regression: the name resolves to the *value*, not the name itself.
    expect(store.get()).toBe("real-token");
  });

  it("re-reads the name lazily, so a settings change is reflected", () => {
    const app = fakeApp({ "a": "token-a", "b": "token-b" });
    let name = "a";
    const store = createTokenStore(app, () => name, makeFallback());
    expect(store.get()).toBe("token-a");
    name = "b";
    expect(store.get()).toBe("token-b");
  });

  it("falls back when the secret name is invalid", () => {
    const app = fakeApp({ "linkwarden-token": "real-token" });
    const store = createTokenStore(app, () => "Not Valid!", makeFallback("fb"));
    expect(store.get()).toBe("fb");
  });

  it("falls back when the secret is missing", () => {
    const app = fakeApp({});
    const store = createTokenStore(
      app,
      () => "linkwarden-token",
      makeFallback("fb"),
    );
    expect(store.get()).toBe("fb");
  });

  it("falls back when getSecret throws", () => {
    const app = fakeApp({ "linkwarden-token": "real-token" }, { throwOnGet: true });
    const store = createTokenStore(
      app,
      () => "linkwarden-token",
      makeFallback("fb"),
    );
    expect(store.get()).toBe("fb");
  });
});

describe("createTokenStore (no SecretStorage)", () => {
  it("reports unavailable and reads/writes the plaintext fallback", () => {
    const app = {} as unknown as App;
    const fallback = makeFallback("initial");
    const store = createTokenStore(app, () => "linkwarden-token", fallback);
    expect(store.hasSecretStorage()).toBe(false);
    expect(store.get()).toBe("initial");
    store.setFallback("typed-token");
    expect(fallback.get()).toBe("typed-token");
    expect(store.get()).toBe("typed-token");
  });
});
