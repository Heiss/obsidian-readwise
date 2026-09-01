// The sync driver. Pure with respect to I/O: it is handed two page-fetching
// functions and drives them, so the whole engine is unit-testable with fakes and
// never imports Obsidian.
//
// Two tiers (R12), and the default is the cheap one:
//
//   tier 1 (always)   GET /v2/export/  — every source you have highlighted,
//                     with all of its highlights nested inside it, so the cost
//                     scales with sources rather than with highlights.
//   tier 2 (opt-in)   GET /v3/list/    — the rest of the library, at one
//                     request per 100 documents.
//
// Tier 2 runs FIRST when enabled, because the export's fallback join looks
// documents up by their original URL and can only find what is already indexed.

import {
  mergeDocuments,
  mergeExport,
  type IndexData,
} from "./index";
import type {
  ExportResponse,
  ListDocumentsParams,
  ListDocumentsResponse,
  ReaderLocation,
} from "../api/models";

export interface SyncDeps {
  exportPage(params: {
    updatedAfter?: string;
    pageCursor?: string;
  }): Promise<ExportResponse>;
  documentPage(params: ListDocumentsParams): Promise<ListDocumentsResponse>;
  now?: () => number;
}

export interface SyncOptions {
  /** Ignore stored cursors and re-pull everything. */
  full?: boolean;
  /** Run tier 2 as well as tier 1. */
  includeDocuments?: boolean;
  /** Which locations tier 2 covers. Empty means all. */
  locations?: ReaderLocation[];
  /** Checked between pages so a long first sync can be stopped. */
  isCancelled?: () => boolean;
  onProgress?: (progress: SyncProgress) => void;
}

export interface SyncProgress {
  phase: "documents" | "highlights";
  /** Pages fetched so far in this run. */
  requests: number;
  documents: number;
  sources: number;
  highlights: number;
}

export interface SyncResult extends SyncProgress {
  cancelled: boolean;
  /** Books the export returned that matched no Reader document. */
  unjoined: number;
  /** Books joined only through the fuzzier source-URL fallback. */
  joinedBySourceUrl: number;
}

/** Refuse to page forever if the server keeps handing back a cursor. */
const MAX_PAGES = 500;

/**
 * Run a sync against `index`, mutating it in place. Returns what it cost, so
 * the UI can tell the user the truth about a first sync rather than guessing.
 */
export async function runSync(
  index: IndexData,
  deps: SyncDeps,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const now = deps.now ?? Date.now;
  const cancelled = options.isCancelled ?? ((): boolean => false);
  const startedAt = now();

  const result: SyncResult = {
    phase: "documents",
    requests: 0,
    documents: 0,
    sources: 0,
    highlights: 0,
    cancelled: false,
    unjoined: 0,
    joinedBySourceUrl: 0,
  };

  const report = (): void => options.onProgress?.({ ...result });

  if (options.includeDocuments) {
    const locations = options.locations?.length
      ? options.locations
      : [undefined];
    const updatedAfter = options.full ? undefined : index.cursors.docsUpdatedAfter;

    outer: for (const location of locations) {
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (cancelled()) {
          result.cancelled = true;
          break outer;
        }
        const response = await deps.documentPage({
          updatedAfter,
          location,
          limit: 100,
          pageCursor: cursor,
        });
        result.requests += 1;
        mergeDocuments(index, response.results);
        result.documents += response.results.length;
        report();

        cursor = response.nextPageCursor ?? undefined;
        if (!cursor) break;
      }
    }

    if (!result.cancelled) {
      index.documentsSyncedAt = startedAt;
      index.cursors.docsUpdatedAfter = new Date(startedAt).toISOString();
    }
  }

  if (result.cancelled) return result;

  result.phase = "highlights";
  report();

  const updatedAfter = options.full
    ? undefined
    : index.cursors.exportUpdatedAfter;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (cancelled()) {
      result.cancelled = true;
      break;
    }
    const response = await deps.exportPage({ updatedAfter, pageCursor: cursor });
    result.requests += 1;

    const merged = mergeExport(index, response.results);
    result.sources += merged.joined;
    result.highlights += merged.highlights;
    result.unjoined += merged.unjoined;
    result.joinedBySourceUrl += merged.joinedBySourceUrl;
    report();

    cursor = response.nextPageCursor ?? undefined;
    if (!cursor) break;
  }

  if (!result.cancelled) {
    // Stamp the watermark with when the run STARTED, not when it finished:
    // anything changed mid-run must be picked up by the next delta rather than
    // falling into the gap between the two timestamps.
    index.highlightsSyncedAt = startedAt;
    index.cursors.exportUpdatedAfter = new Date(startedAt).toISOString();
  }

  return result;
}
