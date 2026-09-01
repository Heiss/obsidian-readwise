import { describe, it, expect } from "vitest";
import {
  documentLabel,
  escapeLabel,
  formatBindingLink,
} from "../src/core/binding";

describe("documentLabel", () => {
  it("prefers the title", () => {
    expect(
      documentLabel({ id: "01gkqtdz9xabcd5gt96khreyb", title: "On RAG", sourceUrl: "https://x.tld" }),
    ).toBe("On RAG");
  });
  it("falls back to the source url", () => {
    expect(
      documentLabel({ id: "01gkqtdz9xabcd5gt96khreyb", title: "  ", sourceUrl: "https://x.tld" }),
    ).toBe("https://x.tld");
  });
  it("falls back to the id", () => {
    expect(documentLabel({ id: "01gkqtdz9xabcd5gt96khreyb" })).toBe("01gkqtdz9xabcd5gt96khreyb");
  });
});

describe("escapeLabel", () => {
  it("escapes brackets", () => {
    expect(escapeLabel("a [b] c")).toBe("a \\[b\\] c");
  });
  it("flattens newlines", () => {
    expect(escapeLabel("a\nb")).toBe("a b");
  });
});

describe("formatBindingLink", () => {
  it("builds a markdown link", () => {
    expect(
      formatBindingLink("On RAG", "https://read.readwise.io/read/01gkqtdz9xabcd5gt96khreyb"),
    ).toBe("[On RAG](https://read.readwise.io/read/01gkqtdz9xabcd5gt96khreyb)");
  });
  it("escapes the label", () => {
    expect(formatBindingLink("a [x]", "https://read.readwise.io/read/01gkqtdz9xabcd5gt96khreyb")).toBe(
      "[a \\[x\\]](https://read.readwise.io/read/01gkqtdz9xabcd5gt96khreyb)",
    );
  });
});
