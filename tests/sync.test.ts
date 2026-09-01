import { describe, it, expect } from "vitest";
import { runSync, type SyncDeps } from "../src/core/sync";
import { emptyIndex } from "../src/core/index";
import type {
  ExportResponse,
  ExportedBook,
  ListDocumentsResponse,
  ReaderDocument,
} from "../src/api/models";

const ID = (n: number): string => `01gkqtdz9xabcd5gt96khre${String(n).padStart(2, "0")}`;

function book(n: number, highlights = 1): ExportedBook {
  return {
    user_book_id: n,
    title: `Book ${n}`,
    author: null,
    unique_url: `https://read.readwise.io/read/${ID(n)}`,
    source_url: `https://example.org/${n}`,
    highlights: Array.from({ length: highlights }, (_, i) => ({
      id: n * 100 + i,
      text: `highlight ${i}`,
      note: null,
      location: i,
      color: null,
      highlighted_at: null,
    })),
  };
}

function document(n: number): ReaderDocument {
  return {
    id: ID(n),
    url: `https://read.readwise.io/new/read/${ID(n)}`,
    source_url: `https://example.org/${n}`,
    title: `Doc ${n}`,
    author: "",
    category: "article",
    location: "new",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

/** Deps that replay pre-built pages and record the params they were called with. */
function fakeDeps(
  exportPages: ExportResponse[],
  documentPages: ListDocumentsResponse[] = [],
): SyncDeps & { exportCalls: unknown[]; documentCalls: unknown[] } {
  const exportCalls: unknown[] = [];
  const documentCalls: unknown[] = [];
  return {
    exportCalls,
    documentCalls,
    now: () => 1_700_000_000_000,
    async exportPage(params) {
      exportCalls.push(params);
      return exportPages.shift() ?? { count: 0, nextPageCursor: null, results: [] };
    },
    async documentPage(params) {
      documentCalls.push(params);
      return documentPages.shift() ?? { count: 0, nextPageCursor: null, results: [] };
    },
  };
}

describe("runSync — tier 1 (the default)", () => {
  it("follows the export cursor to the end", async () => {
    const index = emptyIndex();
    const deps = fakeDeps([
      { count: 3, nextPageCursor: "p2", results: [book(1)] },
      { count: 3, nextPageCursor: "p3", results: [book(2)] },
      { count: 3, nextPageCursor: null, results: [book(3)] },
    ]);
    const result = await runSync(index, deps);
    expect(result.requests).toBe(3);
    expect(result.sources).toBe(3);
    expect(Object.keys(index.docs)).toHaveLength(3);
  });

  // The whole cost argument for using the export: one request carries a source
  // AND all of its highlights, so the request count tracks sources, not
  // highlights. If this ever regresses, first sync gets slow and quiet.
  it("costs one request per page regardless of how many highlights it carries", async () => {
    const index = emptyIndex();
    const deps = fakeDeps([
      { count: 1, nextPageCursor: null, results: [book(1, 500), book(2, 500)] },
    ]);
    const result = await runSync(index, deps);
    expect(result.requests).toBe(1);
    expect(result.highlights).toBe(1000);
  });

  it("does not touch the document endpoint unless asked", async () => {
    const deps = fakeDeps([{ count: 0, nextPageCursor: null, results: [] }]);
    await runSync(emptyIndex(), deps);
    expect(deps.documentCalls).toHaveLength(0);
  });
});

describe("runSync — deltas", () => {
  it("passes no cursor on the first run and stores one afterwards", async () => {
    const index = emptyIndex();
    const deps = fakeDeps([{ count: 0, nextPageCursor: null, results: [] }]);
    await runSync(index, deps);
    expect((deps.exportCalls[0] as { updatedAfter?: string }).updatedAfter).toBeUndefined();
    expect(index.cursors.exportUpdatedAfter).toBe("2023-11-14T22:13:20.000Z");
  });

  it("sends the stored cursor on the next run", async () => {
    const index = emptyIndex();
    index.cursors.exportUpdatedAfter = "2026-01-01T00:00:00.000Z";
    const deps = fakeDeps([{ count: 0, nextPageCursor: null, results: [] }]);
    await runSync(index, deps);
    expect((deps.exportCalls[0] as { updatedAfter?: string }).updatedAfter).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("ignores the cursor for a full rebuild", async () => {
    const index = emptyIndex();
    index.cursors.exportUpdatedAfter = "2026-01-01T00:00:00.000Z";
    const deps = fakeDeps([{ count: 0, nextPageCursor: null, results: [] }]);
    await runSync(index, deps, { full: true });
    expect((deps.exportCalls[0] as { updatedAfter?: string }).updatedAfter).toBeUndefined();
  });

  // Stamped with the run's START, so a highlight changed while the sync was in
  // flight is picked up by the next delta instead of falling through the gap.
  it("stamps the watermark from when the run started", async () => {
    const index = emptyIndex();
    const deps = fakeDeps([{ count: 0, nextPageCursor: null, results: [] }]);
    await runSync(index, deps);
    expect(index.highlightsSyncedAt).toBe(1_700_000_000_000);
  });
});

describe("runSync — tier 2 (opt-in)", () => {
  it("pages documents at the maximum page size", async () => {
    const deps = fakeDeps(
      [{ count: 0, nextPageCursor: null, results: [] }],
      [{ count: 1, nextPageCursor: null, results: [document(1)] }],
    );
    await runSync(emptyIndex(), deps, { includeDocuments: true });
    expect(deps.documentCalls[0]).toMatchObject({ limit: 100 });
  });

  it("requests each configured location", async () => {
    const deps = fakeDeps(
      [{ count: 0, nextPageCursor: null, results: [] }],
      [
        { count: 0, nextPageCursor: null, results: [] },
        { count: 0, nextPageCursor: null, results: [] },
      ],
    );
    await runSync(emptyIndex(), deps, {
      includeDocuments: true,
      locations: ["new", "archive"],
    });
    expect(deps.documentCalls.map((c) => (c as { location?: string }).location)).toEqual([
      "new",
      "archive",
    ]);
  });

  // The export's fallback join looks documents up by their original URL, so the
  // documents have to be in the index before the export runs.
  it("syncs documents before highlights so the fallback join can find them", async () => {
    const index = emptyIndex();
    const order: string[] = [];
    const deps: SyncDeps = {
      now: () => 1,
      async documentPage() {
        order.push("documents");
        return { count: 1, nextPageCursor: null, results: [document(1)] };
      },
      async exportPage() {
        order.push("export");
        return {
          count: 1,
          nextPageCursor: null,
          results: [{ ...book(1), unique_url: null }],
        };
      },
    };
    const result = await runSync(index, deps, { includeDocuments: true });
    expect(order).toEqual(["documents", "export"]);
    expect(result.joinedBySourceUrl).toBe(1);
  });
});

describe("runSync — cancellation", () => {
  it("stops between pages and leaves the watermark unset", async () => {
    const index = emptyIndex();
    let pages = 0;
    const deps: SyncDeps = {
      now: () => 1,
      async documentPage() {
        return { count: 0, nextPageCursor: null, results: [] };
      },
      async exportPage() {
        pages += 1;
        return { count: 9, nextPageCursor: `p${pages}`, results: [book(pages)] };
      },
    };
    const result = await runSync(index, deps, {
      isCancelled: () => pages >= 2,
    });
    expect(result.cancelled).toBe(true);
    expect(pages).toBe(2);
    // Partial data is kept — it is still correct, just incomplete...
    expect(Object.keys(index.docs)).toHaveLength(2);
    // ...but the watermark stays unset, so the panel keeps saying "not synced"
    // rather than claiming documents have no highlights.
    expect(index.highlightsSyncedAt).toBeUndefined();
    expect(index.cursors.exportUpdatedAfter).toBeUndefined();
  });
});

describe("runSync — progress", () => {
  it("reports progress per page so a long first sync is visible", async () => {
    const seen: Array<{ phase: string; sources: number }> = [];
    const deps = fakeDeps([
      { count: 2, nextPageCursor: "p2", results: [book(1)] },
      { count: 2, nextPageCursor: null, results: [book(2)] },
    ]);
    await runSync(emptyIndex(), deps, {
      onProgress: (p) => seen.push({ phase: p.phase, sources: p.sources }),
    });
    // One report when the highlight phase opens, then one per page.
    expect(seen).toEqual([
      { phase: "highlights", sources: 0 },
      { phase: "highlights", sources: 1 },
      { phase: "highlights", sources: 2 },
    ]);
  });
});
