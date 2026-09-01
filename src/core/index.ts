// The local index: the plugin's own store of documents and highlights.
//
// Neither Readwise API offers search or a "highlights for this document"
// endpoint, so the plugin keeps its own copy. Everything here is pure and
// serializable — no Obsidian, no I/O — so the whole thing is unit-testable and
// can be written straight to disk.
//
// The index is *derived state*: nothing the user authored lives in it. That is
// deliberate and worth defending, because it makes the recovery for any
// corruption, schema change or failed sync simply "rebuild".

import { parseBindingId } from "./urls";
import type {
  ExportedBook,
  ReaderDocument,
  ReaderTag,
} from "../api/models";

/** A bindable source, from the export (tier 1) or the document list (tier 2). */
export interface IndexedDoc {
  id: string;
  title: string;
  author?: string;
  /** The URL the document was originally saved from. */
  sourceUrl?: string;
  siteName?: string;
  category?: string;
  location?: string;
  tags: string[];
  updatedAt?: string;
  /** True when only the export has seen this document, not `/v3/list/`. */
  fromExport?: boolean;
}

export interface IndexedHighlight {
  id: string;
  text: string;
  /** The user's note on this highlight, if any. */
  note?: string;
  /** Position in the source; the primary sort key. Null sorts last. */
  location: number | null;
  highlightedAt: string | null;
  /** The highlight's own tags — checked before the source's for colour (R6). */
  tags: string[];
}

/**
 * A book the export returned that could not be joined to a Reader document.
 * Kindle books, podcasts and manually added highlights all land here. This is
 * normal, not an error, and is kept only so the sync can report it.
 */
export interface UnjoinedBook {
  userBookId: number;
  title: string;
  sourceUrl: string | null;
  uniqueUrl: string | null;
  highlightCount: number;
}

export interface IndexData {
  version: 1;
  docs: Record<string, IndexedDoc>;
  highlightsByDoc: Record<string, IndexedHighlight[]>;
  /** Source-level tags, the fallback when a highlight carries none. */
  bookTagsByDoc: Record<string, string[]>;
  unjoined: UnjoinedBook[];
  tags: ReaderTag[];
  cursors: { exportUpdatedAfter?: string; docsUpdatedAfter?: string };
  /**
   * When highlights were last synced. Undefined means *never* — which is what
   * lets the panel say "not synced yet" instead of confidently claiming a
   * document has no highlights.
   */
  highlightsSyncedAt?: number;
  documentsSyncedAt?: number;
}

export function emptyIndex(): IndexData {
  return {
    version: 1,
    docs: {},
    highlightsByDoc: {},
    bookTagsByDoc: {},
    unjoined: [],
    tags: [],
    cursors: {},
  };
}

/** Restore an index from disk, degrading to empty rather than throwing. */
export function reviveIndex(raw: unknown): IndexData {
  if (!raw || typeof raw !== "object") return emptyIndex();
  const data = raw as Partial<IndexData>;
  if (data.version !== 1) return emptyIndex();
  return {
    ...emptyIndex(),
    ...data,
    version: 1,
    docs: data.docs ?? {},
    highlightsByDoc: data.highlightsByDoc ?? {},
    bookTagsByDoc: data.bookTagsByDoc ?? {},
    unjoined: data.unjoined ?? [],
    tags: data.tags ?? [],
    cursors: data.cursors ?? {},
  };
}

/** Tag names from a Reader document's tag object (keyed, not an array). */
function documentTagNames(doc: ReaderDocument): string[] {
  return Object.values(doc.tags ?? {}).map((tag) => tag.name);
}

/** Normalize a URL for joining: scheme, host case, trailing slash and fragment. */
export function joinKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.host.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return null;
  }
}

export type JoinMethod = "id" | "sourceUrl" | "none";

export interface JoinOutcome {
  docId: string | null;
  method: JoinMethod;
}

/**
 * Attach an exported book to a Reader document.
 *
 * `unique_url` is expected to be the book's Reader deep link, which yields the
 * id directly and unambiguously. The `source_url` fallback exists because that
 * expectation is not yet verified against a live account — but it is genuinely
 * fuzzier: two Reader documents can share an original URL, and a wrong join
 * shows one source's highlights under another. So an id match always wins, and
 * the fallback is only consulted when there is no id.
 */
export function joinBook(
  book: Pick<ExportedBook, "unique_url" | "source_url">,
  docsBySourceUrl: ReadonlyMap<string, string>,
): JoinOutcome {
  const byId = book.unique_url ? parseBindingId(book.unique_url) : null;
  if (byId) return { docId: byId, method: "id" };

  const key = joinKey(book.source_url);
  const bySourceUrl = key ? docsBySourceUrl.get(key) : undefined;
  if (bySourceUrl) return { docId: bySourceUrl, method: "sourceUrl" };

  return { docId: null, method: "none" };
}

/** Build the source-URL lookup the fallback join needs. */
export function sourceUrlLookup(index: IndexData): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of Object.values(index.docs)) {
    const key = joinKey(doc.sourceUrl);
    // First writer wins, so a document already known from `/v3/list/` is not
    // displaced by a later export-only entry with the same original URL.
    if (key && !map.has(key)) map.set(key, doc.id);
  }
  return map;
}

/** Merge one page of `GET /v3/list/` into the index. Mutates and returns it. */
export function mergeDocuments(
  index: IndexData,
  documents: readonly ReaderDocument[],
): IndexData {
  for (const doc of documents) {
    // Highlights and notes are documents too; they are not bindable sources and
    // the export is where their content comes from.
    if (doc.category === "highlight" || doc.category === "note") continue;
    if (doc.parent_id) continue;

    index.docs[doc.id] = {
      id: doc.id,
      title: doc.title ?? "",
      author: doc.author || undefined,
      sourceUrl: doc.source_url || undefined,
      siteName: doc.site_name || undefined,
      category: doc.category,
      location: doc.location,
      tags: documentTagNames(doc),
      updatedAt: doc.updated_at,
    };
  }
  return index;
}

export interface MergeExportResult {
  joined: number;
  unjoined: number;
  highlights: number;
  /** Books joined only through the fuzzier source-URL fallback. */
  joinedBySourceUrl: number;
}

/** Merge one page of `GET /v2/export/` into the index. Mutates and returns it. */
export function mergeExport(
  index: IndexData,
  books: readonly ExportedBook[],
): MergeExportResult {
  const lookup = sourceUrlLookup(index);
  const result: MergeExportResult = {
    joined: 0,
    unjoined: 0,
    highlights: 0,
    joinedBySourceUrl: 0,
  };

  for (const book of books) {
    const { docId, method } = joinBook(book, lookup);

    if (!docId) {
      result.unjoined += 1;
      index.unjoined = index.unjoined.filter(
        (b) => b.userBookId !== book.user_book_id,
      );
      index.unjoined.push({
        userBookId: book.user_book_id,
        title: book.title,
        sourceUrl: book.source_url,
        uniqueUrl: book.unique_url,
        highlightCount: book.highlights.length,
      });
      continue;
    }

    result.joined += 1;
    if (method === "sourceUrl") result.joinedBySourceUrl += 1;

    // The export knows about sources `/v3/list/` may never have been asked for,
    // so tier 1 alone can populate the picker — but it must not overwrite the
    // richer record the document list provides.
    const existing = index.docs[docId];
    if (!existing || existing.fromExport) {
      index.docs[docId] = {
        id: docId,
        title: book.title ?? existing?.title ?? "",
        author: book.author || existing?.author,
        sourceUrl: book.source_url || existing?.sourceUrl,
        siteName: existing?.siteName,
        category: existing?.category,
        location: existing?.location,
        tags: existing?.tags ?? [],
        updatedAt: existing?.updatedAt,
        fromExport: true,
      };
    }

    index.bookTagsByDoc[docId] = (book.book_tags ?? []).map((t) => t.name);
    index.highlightsByDoc[docId] = sortHighlights(
      book.highlights.map((h) => ({
        id: String(h.id),
        text: h.text,
        note: h.note?.trim() ? h.note : undefined,
        location: h.location ?? null,
        highlightedAt: h.highlighted_at ?? null,
        tags: (h.tags ?? []).map((t) => t.name),
      })),
    );
    result.highlights += book.highlights.length;
  }

  return result;
}

/**
 * Reading order: by position in the source, then by when it was highlighted.
 * Highlights without a location sort last rather than to the front, so a source
 * that only partly reports positions still reads sensibly.
 */
export function sortHighlights(
  highlights: readonly IndexedHighlight[],
): IndexedHighlight[] {
  return [...highlights].sort((a, b) => {
    if (a.location !== b.location) {
      if (a.location === null) return 1;
      if (b.location === null) return -1;
      return a.location - b.location;
    }
    const at = a.highlightedAt ?? "";
    const bt = b.highlightedAt ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/** What the panel knows about one bound document. */
export type HighlightLookup =
  | { state: "not-synced" }
  | { state: "unknown-document" }
  | { state: "ok"; highlights: IndexedHighlight[]; bookTags: string[] };

/**
 * Look up a bound document's highlights.
 *
 * The three states are distinct on purpose. Before the first sync the index
 * cannot tell "this document has no highlights" from "we have not looked yet",
 * and quietly rendering the first would be a lie the user has no way to catch.
 */
export function highlightsFor(
  index: IndexData,
  docId: string,
): HighlightLookup {
  if (index.highlightsSyncedAt === undefined) return { state: "not-synced" };
  const known = index.docs[docId] !== undefined;
  const highlights = index.highlightsByDoc[docId];
  if (!known && !highlights) return { state: "unknown-document" };
  return {
    state: "ok",
    highlights: highlights ?? [],
    bookTags: index.bookTagsByDoc[docId] ?? [],
  };
}

/** Score a document against a query. Higher is better; 0 means no match. */
function score(doc: IndexedDoc, needle: string): number {
  const title = doc.title.toLowerCase();
  if (title === needle) return 100;
  if (title.startsWith(needle)) return 80;
  if (title.includes(needle)) return 60;

  const haystacks: Array<string | undefined> = [
    doc.author,
    doc.siteName,
    doc.sourceUrl,
    ...doc.tags,
  ];
  for (const field of haystacks) {
    if (field && field.toLowerCase().includes(needle)) return 30;
  }
  return 0;
}

/**
 * Search the index. An empty query returns the most recently updated documents,
 * so the picker is useful before the user has typed anything.
 */
export function searchDocuments(
  index: IndexData,
  query: string,
  limit = 20,
): IndexedDoc[] {
  const docs = Object.values(index.docs);
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return [...docs]
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .slice(0, limit);
  }

  return docs
    .map((doc) => ({ doc, score: score(doc, needle) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .slice(0, limit)
    .map((hit) => hit.doc);
}

/** Totals for the settings sync status line. */
export function indexStats(index: IndexData): {
  documents: number;
  highlights: number;
  sources: number;
  unjoined: number;
} {
  let highlights = 0;
  let sources = 0;
  for (const list of Object.values(index.highlightsByDoc)) {
    if (list.length > 0) sources += 1;
    highlights += list.length;
  }
  return {
    documents: Object.keys(index.docs).length,
    highlights,
    sources,
    unjoined: index.unjoined.length,
  };
}
