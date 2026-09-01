import { describe, it, expect } from "vitest";
import { formatQuote, blockId, hasBlockId } from "../src/core/quote";
import { DEFAULT_COLOR, type ColorRule } from "../src/core/colorRules";
import type { IndexedHighlight } from "../src/core/index";

const DOC = "01gkqtdz9xabcd5gt96khreyb";
const HREF = `https://read.readwise.io/read/${DOC}`;

const rules: ColorRule[] = [
  { tag: "idea", color: "green", callout: "success", noteTag: "idea" },
];

function highlight(over: Partial<IndexedHighlight> = {}): IndexedHighlight {
  return {
    id: "1571",
    text: "Retrieval grounds a model's output in an external corpus.",
    location: 1,
    highlightedAt: null,
    tags: [],
    ...over,
  };
}

const options = {
  rules,
  defaultColor: DEFAULT_COLOR,
  bookTags: [] as string[],
  sourceHref: HREF,
  sourceLabel: "On RAG",
};

describe("blockId / hasBlockId", () => {
  it("prefixes the highlight id", () => {
    expect(blockId("1571")).toBe("rw-1571");
  });

  // Readwise ids are not fixed-length, so a short id must not match inside a
  // longer one — otherwise inserting highlight 12 would be silently refused
  // because highlight 1234 is already in the note.
  it("does not match a longer id that starts with the same characters", () => {
    expect(hasBlockId("text ^rw-1234", "12")).toBe(false);
    expect(hasBlockId("text ^rw-12", "12")).toBe(true);
    expect(hasBlockId("text ^rw-12 more", "12")).toBe(true);
  });

  it("is false for a note that has no block ids at all", () => {
    expect(hasBlockId("just prose", "1571")).toBe(false);
  });
});

describe("formatQuote", () => {
  it("renders a callout carrying the source link and the block id", () => {
    expect(formatQuote(highlight(), options)).toBe(
      `> [!quote] [On RAG](${HREF})\n` +
        `> Retrieval grounds a model's output in an external corpus. ^rw-1571`,
    );
  });

  it("puts a note on its own line and moves the block id there", () => {
    const out = formatQuote(highlight({ note: "  my thought  " }), options);
    expect(out).toContain("> **Note:** my thought ^rw-1571");
    expect(out).not.toContain("corpus. ^rw-1571");
  });

  it("uses the callout and note tag from the matching colour rule", () => {
    const out = formatQuote(highlight({ tags: ["idea"] }), options);
    expect(out.startsWith(`> [!success] [On RAG](${HREF}) #idea`)).toBe(true);
  });

  it("falls back to the source's tags when the highlight has none", () => {
    const out = formatQuote(highlight(), { ...options, bookTags: ["idea"] });
    expect(out.startsWith("> [!success]")).toBe(true);
  });

  it("uses the default callout when no rule matches", () => {
    expect(formatQuote(highlight({ tags: ["nope"] }), options)).toContain("[!quote]");
  });

  it("prefixes every line of a multi-line highlight", () => {
    const out = formatQuote(highlight({ text: "one\ntwo" }), options);
    expect(out).toContain("> one\n> two ^rw-1571");
  });
});
