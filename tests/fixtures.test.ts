import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ExportResponse,
  ListDocumentsResponse,
  ListTagsResponse,
} from "../src/api/models";
import { emptyIndex, highlightsFor, searchDocuments } from "../src/core/index";
import { runSync } from "../src/core/sync";
import { resolveColor, DEFAULT_COLOR_RULES, DEFAULT_COLOR } from "../src/core/colorRules";
import { formatQuote } from "../src/core/quote";

// Readwise publishes no OpenAPI spec, so there is nothing to diff a generated
// client against. These fixtures stand in for that: they are the recorded shape
// the hand-written models are built for, they are what the mock server serves,
// and this file drives the real sync over them end to end. When the checklist in
// docs/api-notes.md is run against a live token, correct the fixtures and this
// test tells you what stopped fitting.

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8")) as T;

const documents = load<ListDocumentsResponse>("documents.json");
const exported = load<ExportResponse>("export.json");
const tags = load<ListTagsResponse>("tags.json");

const RAG = "01gkqtdz9xabcd5gt96khreyb";
const ORDER = "01gwfvp9pyaabcdgmx14f6ha0";
const UNREAD = "01h6qabyzghazrt1qsjvf9zeqa";

describe("fixture shapes", () => {
  it("documents carry the fields the index stores", () => {
    const doc = documents.results[0];
    expect(doc.id).toBe(RAG);
    expect(doc.source_url).toBe("https://example.org/on-rag");
    // Tags are an object keyed by tag key, not an array.
    expect(Object.keys(doc.tags ?? {})).toContain("papers");
  });

  it("a document url embeds its triage location", () => {
    expect(documents.results[1].url).toContain("/archive/read/");
  });

  it("exported highlights carry text, note, position and tags", () => {
    const highlight = exported.results[0].highlights[1];
    expect(highlight.text).toContain("retrieval step");
    expect(highlight.note).toContain("eval");
    expect(highlight.location).toBe(44);
    expect(highlight.tags?.map((t) => t.name)).toEqual(["objection"]);
  });

  it("tags come back as key/name pairs", () => {
    expect(tags.results[0]).toEqual({ key: "definition", name: "definition" });
  });
});

/** Drive the real sync over the fixtures, one page each. */
async function syncedIndex(includeDocuments: boolean) {
  const index = emptyIndex();
  const result = await runSync(
    index,
    {
      now: () => 1_700_000_000_000,
      exportPage: async () => exported,
      documentPage: async () => documents,
    },
    { includeDocuments },
  );
  return { index, result };
}

describe("end to end over the fixtures", () => {
  it("tier 1 alone binds every highlighted source", async () => {
    const { index, result } = await syncedIndex(false);
    expect(result.requests).toBe(1);
    expect(result.sources).toBe(2);
    expect(result.highlights).toBe(4);
    expect(Object.keys(index.docs).sort()).toEqual([ORDER, RAG].sort());
  });

  // The point of the export: one request carries four highlights across two
  // sources. Paging Reader's own highlight documents could not do that.
  it("costs one request for a whole library page", async () => {
    const { result } = await syncedIndex(false);
    expect(result.requests).toBe(1);
  });

  it("reports the Kindle book as unjoined rather than failing on it", async () => {
    const { index, result } = await syncedIndex(false);
    expect(result.unjoined).toBe(1);
    expect(index.unjoined[0].title).toBe("A Book Read on Kindle");
  });

  it("tier 2 adds the document nobody highlighted", async () => {
    const { index } = await syncedIndex(true);
    expect(index.docs[UNREAD]?.title).toBe("An Essay Nobody Highlighted Yet");
    expect(highlightsFor(index, UNREAD)).toEqual({
      state: "ok",
      highlights: [],
      bookTags: [],
    });
  });

  it("orders highlights by position in the source", async () => {
    const { index } = await syncedIndex(false);
    expect(index.highlightsByDoc[RAG].map((h) => h.location)).toEqual([12, 44, 90]);
  });

  it("finds a source by title through the picker's search", async () => {
    const { index } = await syncedIndex(false);
    expect(searchDocuments(index, "nature").map((d) => d.id)).toEqual([ORDER]);
  });
});

describe("colour rules over the fixtures", () => {
  it("colours each highlight from its own tag", async () => {
    const { index } = await syncedIndex(false);
    const colours = index.highlightsByDoc[RAG].map(
      (h) => resolveColor(DEFAULT_COLOR_RULES, h.tags, index.bookTagsByDoc[RAG]).matched,
    );
    expect(colours).toEqual(["definition", "objection", "idea"]);
  });

  // Readwise's own `color` field is present in the fixture and deliberately
  // ignored: one mechanism under the user's control beats two that disagree.
  it("ignores the colour Readwise reports", async () => {
    const { index } = await syncedIndex(false);
    const resolved = resolveColor(
      [],
      index.highlightsByDoc[RAG][0].tags,
      index.bookTagsByDoc[RAG],
    );
    expect(exported.results[0].highlights[0].color).toBe("yellow");
    expect(resolved).toEqual(DEFAULT_COLOR);
  });

  it("falls back to the source's tag when a highlight has none", async () => {
    const { index } = await syncedIndex(false);
    const resolved = resolveColor(
      [{ tag: "design", color: "teal", callout: "abstract" }],
      index.highlightsByDoc[ORDER][0].tags,
      index.bookTagsByDoc[ORDER],
    );
    expect(resolved.color).toBe("teal");
  });

  it("renders a quote with the rule's callout and the source link", async () => {
    const { index } = await syncedIndex(false);
    const quote = formatQuote(index.highlightsByDoc[RAG][1], {
      rules: DEFAULT_COLOR_RULES,
      defaultColor: DEFAULT_COLOR,
      bookTags: index.bookTagsByDoc[RAG],
      sourceHref: `https://read.readwise.io/read/${RAG}`,
      sourceLabel: "On RAG",
    });
    expect(quote).toContain("[!warning]");
    expect(quote).toContain("#objection");
    expect(quote).toContain("> **Note:** Matches what we saw");
    expect(quote).toContain("^rw-1572");
  });
});

describe("delta sync over the fixtures", () => {
  it("re-merging a page does not duplicate anything", async () => {
    const { index } = await syncedIndex(false);
    const before = index.highlightsByDoc[RAG].length;
    await runSync(
      index,
      {
        now: () => 1_700_000_100_000,
        exportPage: async () => exported,
        documentPage: async () => documents,
      },
      {},
    );
    expect(index.highlightsByDoc[RAG]).toHaveLength(before);
    expect(index.unjoined).toHaveLength(1);
  });
});
