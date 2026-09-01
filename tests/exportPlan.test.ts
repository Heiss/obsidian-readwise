import { describe, it, expect } from "vitest";
import {
  buildExportItems,
  applyRewrites,
  type Rewrite,
} from "../src/core/exportPlan";
import { extractLinks } from "../src/core/links";
import { buildDeepLink } from "../src/core/urls";

/** A stand-in Reader document id; only its shape matters here. */
const docId = (n: number): string => `01gkqtdz9xabcd5gt96khre${String(n).padStart(2, "0")}`;


/** Build a Rewrite for the single link in `md` pointing at `href`. */
function rewriteFor(md: string, href: string): Rewrite {
  const [link] = extractLinks(md);
  return { link, href, fallbackLabel: "Fallback" };
}

describe("buildExportItems", () => {
  it("marks existing bindings as alreadyLinked", () => {
    const md =
      "[On RAG](https://read.readwise.io/read/01gkqtdz9xabcd5gt96khreyb) and [ext](https://example.org)";
    const items = buildExportItems(md);
    expect(items).toHaveLength(2);
    expect(items[0].alreadyLinked).toBe(true);
    expect(items[1].alreadyLinked).toBe(false);
  });

  it("labels with the link text, else the url", () => {
    const md = "[Nice](https://a.tld) and https://b.tld";
    const items = buildExportItems(md);
    expect(items[0].label).toBe("Nice");
    expect(items[1].label).toBe("https://b.tld");
  });

  it("keeps reading order", () => {
    const md = "https://a.tld then [b](https://b.tld)";
    expect(buildExportItems(md).map((i) => i.link.url)).toEqual([
      "https://a.tld",
      "https://b.tld",
    ]);
  });
});

describe("applyRewrites", () => {
  it("swaps only the url of a markdown link, keeping its text", () => {
    const md = "See [A Pattern Language](https://example.org/pl) today.";
    const out = applyRewrites(md, [rewriteFor(md, buildDeepLink(docId(7)))]);
    expect(out).toBe(`See [A Pattern Language](${buildDeepLink(docId(7))}) today.`);
  });

  it("wraps a bare url into a labelled binding", () => {
    const md = "Read https://example.org/x here.";
    const out = applyRewrites(md, [rewriteFor(md, buildDeepLink(docId(9)))]);
    expect(out).toBe(
      `Read [https://example.org/x](${buildDeepLink(docId(9))}) here.`,
    );
  });

  it("applies several rewrites without corrupting earlier offsets", () => {
    const md = "https://a.tld and [b](https://b.tld) and https://c.tld";
    const links = extractLinks(md);
    const rewrites: Rewrite[] = links.map((link, i) => ({
      link,
      href: buildDeepLink(docId(i + 1)),
      fallbackLabel: "x",
    }));
    const out = applyRewrites(md, rewrites);
    expect(out).toBe(
      `[https://a.tld](${buildDeepLink(docId(1))}) and [b](${buildDeepLink(docId(2))}) and [https://c.tld](${buildDeepLink(docId(3))})`,
    );
  });

  it("is order-independent (sorts internally, end to start)", () => {
    const md = "https://a.tld and https://b.tld";
    const links = extractLinks(md);
    const forward: Rewrite[] = links.map((link, i) => ({
      link,
      href: buildDeepLink(docId(i + 1)),
      fallbackLabel: "x",
    }));
    const reversed = [...forward].reverse();
    expect(applyRewrites(md, forward)).toBe(applyRewrites(md, reversed));
  });
});
