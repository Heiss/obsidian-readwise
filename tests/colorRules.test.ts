import { describe, it, expect } from "vitest";
import {
  resolveColor,
  DEFAULT_COLOR,
  type ColorRule,
} from "../src/core/colorRules";

const rules: ColorRule[] = [
  { tag: "objection", color: "red", callout: "warning" },
  { tag: "idea", color: "green", callout: "success", noteTag: "idea" },
];

describe("resolveColor", () => {
  it("matches a highlight's tag", () => {
    expect(resolveColor(rules, ["idea"]).color).toBe("green");
  });

  it("carries the callout and note tag through", () => {
    const resolved = resolveColor(rules, ["idea"]);
    expect(resolved.callout).toBe("success");
    expect(resolved.noteTag).toBe("idea");
  });

  // The reason rules are an ordered list rather than a keyed map: a highlight
  // can carry several matching tags, and the user's order must decide.
  it("takes the first matching rule in the user's order", () => {
    expect(resolveColor(rules, ["idea", "objection"]).matched).toBe("objection");
    const reordered = [rules[1], rules[0]];
    expect(resolveColor(reordered, ["idea", "objection"]).matched).toBe("idea");
  });

  it("prefers a highlight's own tags over its source's", () => {
    expect(resolveColor(rules, ["idea"], ["objection"]).color).toBe("green");
  });

  it("falls back to the source's tags when the highlight has none", () => {
    expect(resolveColor(rules, [], ["objection"]).color).toBe("red");
  });

  it("uses the default colour when nothing matches", () => {
    expect(resolveColor(rules, ["unmapped"])).toEqual(DEFAULT_COLOR);
    expect(resolveColor(rules, [], [])).toEqual(DEFAULT_COLOR);
    expect(resolveColor([], ["idea"])).toEqual(DEFAULT_COLOR);
  });

  it("accepts a caller-supplied default", () => {
    const mine = { color: "blue", callout: "note", matched: null };
    expect(resolveColor(rules, ["nope"], [], mine)).toEqual(mine);
  });

  it("matches tags case- and whitespace-insensitively", () => {
    expect(resolveColor(rules, ["  IDEA "]).color).toBe("green");
    expect(resolveColor([{ tag: " Idea ", color: "x", callout: "c" }], ["idea"]).color).toBe("x");
  });
});
