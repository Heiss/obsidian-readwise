import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/settings";
import { DEFAULT_COLOR } from "../src/core/colorRules";

describe("mergeSettings", () => {
  it("returns the defaults for empty data", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps persisted values", () => {
    const merged = mergeSettings({ defaultLocation: "later" });
    expect(merged.defaultLocation).toBe("later");
  });

  // An empty rule list means "every highlight gets the default colour", which is
  // a real choice — it must survive a reload rather than being refilled.
  it("preserves an explicitly empty rule list", () => {
    expect(mergeSettings({ colorRules: [] }).colorRules).toEqual([]);
  });

  it("fills in a partially persisted default colour", () => {
    const merged = mergeSettings({
      defaultColor: { color: "hotpink" } as never,
    });
    expect(merged.defaultColor.color).toBe("hotpink");
    expect(merged.defaultColor.callout).toBe(DEFAULT_COLOR.callout);
  });

  it("does not index the feed bucket by default", () => {
    expect(DEFAULT_SETTINGS.indexedLocations).not.toContain("feed");
  });

  it("leaves the expensive document index off by default", () => {
    expect(DEFAULT_SETTINGS.indexAllDocuments).toBe(false);
  });

  it("never carries a token value in the settings defaults", () => {
    expect(DEFAULT_SETTINGS.tokenFallback).toBe("");
  });
});
