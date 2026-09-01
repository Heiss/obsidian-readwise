import { describe, it, expect } from "vitest";
import { extractLinks, extractBindings } from "../src/core/links";

describe("extractLinks", () => {
  it("finds a markdown link with its text and url span", () => {
    const md = "See [On RAG](https://example.org/paper) today.";
    const links = extractLinks(md);
    expect(links).toHaveLength(1);
    const l = links[0];
    expect(l.kind).toBe("markdown");
    expect(l.text).toBe("On RAG");
    expect(l.url).toBe("https://example.org/paper");
    // The url span must slice back to exactly the url.
    expect(md.slice(l.urlStart, l.urlEnd)).toBe("https://example.org/paper");
    // The full span covers the whole [text](url).
    expect(md.slice(l.start, l.end)).toBe("[On RAG](https://example.org/paper)");
  });

  it("finds a bare url and reports null text", () => {
    const md = "Visit https://example.org/x now.";
    const links = extractLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe("bare");
    expect(links[0].text).toBeNull();
    expect(links[0].url).toBe("https://example.org/x");
    expect(md.slice(links[0].start, links[0].end)).toBe(
      "https://example.org/x",
    );
  });

  it("strips a link title from the url", () => {
    const md = '[t](https://example.org "the title")';
    const links = extractLinks(md);
    expect(links[0].url).toBe("https://example.org");
  });

  it("excludes image embeds", () => {
    const md = "![alt](https://example.org/pic.png)";
    expect(extractLinks(md)).toHaveLength(0);
  });

  it("excludes fenced code blocks", () => {
    const md = "```\nsee [x](https://example.org)\n```\nreal https://real.tld";
    const links = extractLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://real.tld");
  });

  it("excludes tilde-fenced code blocks", () => {
    const md = "~~~\n[x](https://example.org)\n~~~";
    expect(extractLinks(md)).toHaveLength(0);
  });

  it("excludes inline code", () => {
    const md = "run `curl https://example.org` then [y](https://y.tld)";
    const links = extractLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://y.tld");
  });

  it("excludes wikilinks and wiki embeds", () => {
    const md = "[[Some Note]] and ![[Image.png]] and [z](https://z.tld)";
    const links = extractLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://z.tld");
  });

  it("ignores non-http urls", () => {
    const md = "[a](mailto:x@y.tld) [b](/relative/path) [c](obsidian://x)";
    expect(extractLinks(md)).toHaveLength(0);
  });

  it("does not double-count a url that is also a markdown target", () => {
    const md = "[label](https://example.org/a)";
    const links = extractLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe("markdown");
  });

  it("finds multiple links in reading order", () => {
    const md = "[a](https://a.tld) then https://b.tld then [c](https://c.tld)";
    const urls = extractLinks(md).map((l) => l.url);
    expect(urls).toEqual(["https://a.tld", "https://b.tld", "https://c.tld"]);
  });

  it("does not treat a bare Reader url inside a markdown target as bare", () => {
    const md = "[On RAG](https://read.readwise.io/read/01gkqtdz9xabcd5gt96khreyb)";
    const links = extractLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe("markdown");
  });
});

describe("extractBindings", () => {
  it("returns only links that resolve to a document id", () => {
    const md =
      "[On RAG](https://read.readwise.io/read/01gkqtdz9xabcd5gt96khreyb) and [ext](https://example.org)";
    const bindings = extractBindings(md);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].id).toBe("01gkqtdz9xabcd5gt96khreyb");
    expect(bindings[0].text).toBe("On RAG");
  });

  it("dedupes the same document reached through different triage locations", () => {
    const md =
      "[a](https://read.readwise.io/new/read/01gkqtdz9xabcd5gt96khreyb) [b](https://read.readwise.io/archive/read/01gkqtdz9xabcd5gt96khreyb)";
    const bindings = extractBindings(md);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].text).toBe("a");
  });

  it("returns ids in reading order", () => {
    const md =
      "[a](https://read.readwise.io/read/01gwfvp9pyaabcdgmx14f6ha0) [b](https://read.readwise.io/read/01gkqtdz9xabcd5gt96khreyb)";
    const ids = extractBindings(md).map((b) => b.id);
    expect(ids).toEqual(["01gwfvp9pyaabcdgmx14f6ha0", "01gkqtdz9xabcd5gt96khreyb"]);
  });
});
