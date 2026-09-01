import { describe, it, expect } from "vitest";
import {
  emptyIndex,
  reviveIndex,
  joinBook,
  joinKey,
  mergeDocuments,
  mergeExport,
  sortHighlights,
  highlightsFor,
  searchDocuments,
  indexStats,
  sourceUrlLookup,
  type IndexData,
  type IndexedHighlight,
} from "../src/core/index";
import type { ExportedBook, ReaderDocument } from "../src/api/models";

const DOC_ID = "01gkqtdz9xabcd5gt96khreyb";

function doc(over: Partial<ReaderDocument> = {}): ReaderDocument {
  return {
    id: DOC_ID,
    url: `https://read.readwise.io/new/read/${DOC_ID}`,
    source_url: "https://example.org/on-rag",
    title: "On RAG",
    author: "A. Author",
    category: "article",
    location: "new",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...over,
  };
}

function book(over: Partial<ExportedBook> = {}): ExportedBook {
  return {
    user_book_id: 7,
    title: "On RAG",
    author: "A. Author",
    unique_url: `https://read.readwise.io/read/${DOC_ID}`,
    source_url: "https://example.org/on-rag",
    highlights: [],
    ...over,
  };
}

describe("joinKey", () => {
  it("ignores scheme, host case, trailing slash and fragment", () => {
    expect(joinKey("https://Example.org/a/")).toBe(joinKey("http://example.org/a#x"));
  });
  it("returns null for a non-url", () => {
    expect(joinKey("nope")).toBeNull();
    expect(joinKey(null)).toBeNull();
  });
});

describe("joinBook", () => {
  it("joins on the Reader id in unique_url", () => {
    expect(joinBook(book(), new Map())).toEqual({ docId: DOC_ID, method: "id" });
  });

  it("falls back to the original URL when there is no Reader id", () => {
    const lookup = new Map([[joinKey("https://example.org/on-rag")!, DOC_ID]]);
    expect(
      joinBook({ unique_url: null, source_url: "https://example.org/on-rag" }, lookup),
    ).toEqual({ docId: DOC_ID, method: "sourceUrl" });
  });

  // The fallback is fuzzier than an id: a wrong join shows one source's
  // highlights under another, which is quiet and worse than showing none.
  it("prefers the id even when the URL lookup would also match something else", () => {
    const lookup = new Map([[joinKey("https://example.org/on-rag")!, "otherdocid"]]);
    expect(joinBook(book(), lookup).docId).toBe(DOC_ID);
  });

  it("reports no join for a book that is not a Reader document", () => {
    expect(
      joinBook({ unique_url: null, source_url: null }, new Map()),
    ).toEqual({ docId: null, method: "none" });
  });
});

describe("mergeDocuments", () => {
  it("indexes a document with its tag names flattened", () => {
    const index = emptyIndex();
    mergeDocuments(index, [
      doc({ tags: { ml: { name: "ml" }, papers: { name: "papers" } } }),
    ]);
    expect(index.docs[DOC_ID].tags).toEqual(["ml", "papers"]);
  });

  // Highlights and notes are documents too; they are not bindable sources.
  it("skips highlight and note documents", () => {
    const index = emptyIndex();
    mergeDocuments(index, [
      doc({ id: "h1", category: "highlight", parent_id: DOC_ID }),
      doc({ id: "n1", category: "note", parent_id: "h1" }),
    ]);
    expect(Object.keys(index.docs)).toEqual([]);
  });
});

describe("mergeExport", () => {
  it("stores highlights against the joined document", () => {
    const index = emptyIndex();
    const result = mergeExport(index, [
      book({
        highlights: [
          { id: 1, text: "one", note: null, location: 5, color: null, highlighted_at: null },
          { id: 2, text: "two", note: " mine ", location: 2, color: null, highlighted_at: null },
        ],
      }),
    ]);
    expect(result).toMatchObject({ joined: 1, highlights: 2, unjoined: 0 });
    expect(index.highlightsByDoc[DOC_ID].map((h) => h.text)).toEqual(["two", "one"]);
    expect(index.highlightsByDoc[DOC_ID][0].note).toBe(" mine ");
  });

  it("makes an export-only source bindable, so tier 1 alone fills the picker", () => {
    const index = emptyIndex();
    mergeExport(index, [book()]);
    expect(index.docs[DOC_ID]).toMatchObject({ title: "On RAG", fromExport: true });
  });

  it("does not let the export overwrite the richer document-list record", () => {
    const index = emptyIndex();
    mergeDocuments(index, [doc({ site_name: "Example", location: "later" })]);
    mergeExport(index, [book({ title: "Stale title" })]);
    expect(index.docs[DOC_ID].title).toBe("On RAG");
    expect(index.docs[DOC_ID].siteName).toBe("Example");
  });

  // Kindle books, podcasts and manual highlights have no Reader document. That
  // is normal traffic, not an error.
  it("parks a book that joins to nothing without failing", () => {
    const index = emptyIndex();
    const result = mergeExport(index, [
      book({ unique_url: null, source_url: null, user_book_id: 9, title: "A Kindle book" }),
    ]);
    expect(result.unjoined).toBe(1);
    expect(index.unjoined[0].title).toBe("A Kindle book");
    expect(Object.keys(index.docs)).toEqual([]);
  });

  it("does not accumulate duplicates of the same unjoined book", () => {
    const index = emptyIndex();
    const orphan = book({ unique_url: null, source_url: null, user_book_id: 9 });
    mergeExport(index, [orphan]);
    mergeExport(index, [orphan]);
    expect(index.unjoined).toHaveLength(1);
  });

  it("counts fallback joins separately, because they are less trustworthy", () => {
    const index = emptyIndex();
    mergeDocuments(index, [doc()]);
    const result = mergeExport(index, [book({ unique_url: null })]);
    expect(result).toMatchObject({ joined: 1, joinedBySourceUrl: 1 });
  });

  it("keeps the source's own tags for the colour fallback", () => {
    const index = emptyIndex();
    mergeExport(index, [book({ book_tags: [{ id: 1, name: "papers" }] })]);
    expect(index.bookTagsByDoc[DOC_ID]).toEqual(["papers"]);
  });
});

describe("sortHighlights", () => {
  const h = (over: Partial<IndexedHighlight>): IndexedHighlight => ({
    id: "1",
    text: "t",
    location: null,
    highlightedAt: null,
    tags: [],
    ...over,
  });

  it("orders by position in the source", () => {
    const sorted = sortHighlights([h({ id: "a", location: 9 }), h({ id: "b", location: 2 })]);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a"]);
  });

  // A source that reports positions for only some highlights should still read
  // sensibly, so the unknown ones go last rather than jumping to the front.
  it("puts highlights without a position last", () => {
    const sorted = sortHighlights([h({ id: "a" }), h({ id: "b", location: 4 })]);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("breaks ties by when it was highlighted", () => {
    const sorted = sortHighlights([
      h({ id: "a", location: 1, highlightedAt: "2026-02-01" }),
      h({ id: "b", location: 1, highlightedAt: "2026-01-01" }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("highlightsFor", () => {
  // The distinction that keeps the panel honest: before the first sync we do
  // not know that a document has no highlights, we just have not looked.
  it("reports not-synced before the first sync, not an empty result", () => {
    expect(highlightsFor(emptyIndex(), DOC_ID)).toEqual({ state: "not-synced" });
  });

  it("reports an empty list once a sync has happened", () => {
    const index = emptyIndex();
    mergeDocuments(index, [doc()]);
    index.highlightsSyncedAt = 1;
    expect(highlightsFor(index, DOC_ID)).toEqual({
      state: "ok",
      highlights: [],
      bookTags: [],
    });
  });

  it("flags a binding to a document that is not in the library", () => {
    const index = emptyIndex();
    index.highlightsSyncedAt = 1;
    expect(highlightsFor(index, "somebodyelsesdoc")).toEqual({
      state: "unknown-document",
    });
  });
});

describe("searchDocuments", () => {
  function seeded(): IndexData {
    const index = emptyIndex();
    mergeDocuments(index, [
      doc({ id: "a", title: "On RAG", source_url: "https://example.org/a", updated_at: "2026-01-01" }),
      doc({
        id: "b",
        title: "Retrieval systems",
        author: "Bea",
        source_url: "https://example.org/b",
        updated_at: "2026-03-01",
      }),
      doc({
        id: "c",
        title: "Unrelated",
        site_name: "ragtime.example",
        source_url: "https://example.org/c",
        updated_at: "2026-02-01",
      }),
    ]);
    return index;
  }

  it("returns the most recently updated documents for an empty query", () => {
    expect(searchDocuments(seeded(), "").map((d) => d.id)).toEqual(["b", "c", "a"]);
  });

  it("ranks a title match above a match in another field", () => {
    expect(searchDocuments(seeded(), "rag").map((d) => d.id)).toEqual(["a", "c"]);
  });

  it("matches the author and site name too", () => {
    expect(searchDocuments(seeded(), "bea").map((d) => d.id)).toEqual(["b"]);
  });

  it("honours the limit", () => {
    expect(searchDocuments(seeded(), "", 2)).toHaveLength(2);
  });
});

describe("reviveIndex", () => {
  // The index holds nothing the user authored, so the correct response to
  // anything unreadable is to start over rather than to fail.
  it("degrades to an empty index rather than throwing", () => {
    expect(reviveIndex(null)).toEqual(emptyIndex());
    expect(reviveIndex("garbage")).toEqual(emptyIndex());
    expect(reviveIndex({ version: 99 })).toEqual(emptyIndex());
  });

  it("fills in fields a older or partial file is missing", () => {
    const revived = reviveIndex({ version: 1, docs: { x: { id: "x", title: "T", tags: [] } } });
    expect(revived.docs.x.title).toBe("T");
    expect(revived.unjoined).toEqual([]);
    expect(revived.cursors).toEqual({});
  });
});

describe("indexStats and sourceUrlLookup", () => {
  it("counts documents, sources and highlights", () => {
    const index = emptyIndex();
    mergeExport(index, [
      book({
        highlights: [
          { id: 1, text: "one", note: null, location: 1, color: null, highlighted_at: null },
        ],
      }),
    ]);
    expect(indexStats(index)).toMatchObject({ documents: 1, sources: 1, highlights: 1 });
  });

  it("lets an indexed document win the source-url lookup over an export-only one", () => {
    const index = emptyIndex();
    mergeDocuments(index, [doc()]);
    const lookup = sourceUrlLookup(index);
    expect(lookup.get(joinKey("https://example.org/on-rag")!)).toBe(DOC_ID);
  });
});
