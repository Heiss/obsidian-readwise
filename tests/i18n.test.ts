import { describe, it, expect, beforeEach } from "vitest";
import { en } from "../src/i18n/en";
import { de } from "../src/i18n/de";
import { initI18n, t } from "../src/i18n";

/** Recursively collect the "shape" of a message table: dotted key → "fn" | "str". */
function shape(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "function") out[path] = "fn";
    else if (value && typeof value === "object") Object.assign(out, shape(value, path));
    else out[path] = "str";
  }
  return out;
}

describe("i18n locales", () => {
  it("German mirrors the English key structure and value kinds exactly", () => {
    // TypeScript enforces this at compile time; this asserts it at runtime too,
    // so a hand-edited translation can't silently drift (e.g. a string where en
    // has an interpolation function).
    expect(shape(de)).toEqual(shape(en));
  });

  it("every English leaf differs from German (nothing left untranslated)", () => {
    // Sanity check that de.ts isn't a partial copy of en.ts. Interpolation
    // functions are compared by a representative call.
    const misses: string[] = [];
    const walk = (a: unknown, b: unknown, prefix = ""): void => {
      for (const [key, av] of Object.entries(a as Record<string, unknown>)) {
        const bv = (b as Record<string, unknown>)[key];
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof av === "function") {
          // Call with placeholder args; product-name-only strings may still match.
          const args = Array.from({ length: av.length }, (_, i) => i);
          if ((av as (...a: number[]) => string)(...args) ===
              (bv as (...a: number[]) => string)(...args)) {
            misses.push(path);
          }
        } else if (av && typeof av === "object") {
          walk(av, bv, path);
        } else if (av === bv) {
          misses.push(path);
        }
      }
    };
    walk(en, de);
    // Product-name-only leaves legitimately match across locales; allow a few.
    expect(misses.length).toBeLessThan(5);
  });
});

describe("initI18n / t", () => {
  beforeEach(() => initI18n("en"));

  it("defaults to English for unknown locales", () => {
    initI18n("qq");
    expect(t().settings.tokenName).toBe(en.settings.tokenName);
  });

  it("switches to German when the locale is 'de'", () => {
    initI18n("de");
    expect(t().settings.tokenName).toBe(de.settings.tokenName);
    initI18n("en");
    expect(t().settings.tokenName).toBe("Access token");
  });
});
