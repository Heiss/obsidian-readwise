// Hand-written models for the two Readwise APIs the plugin uses. Unlike the
// Linkwarden plugin, whose types were generated from an official OpenAPI spec,
// Readwise publishes no machine-readable schema — so these are maintained by
// hand and pinned by fixture tests against recorded real responses (R9).
//
// Field names are the wire format verbatim (snake_case), with the single
// exception Readwise itself makes: the paging cursor is camelCase.

// ---------------------------------------------------------------------------
// Reader v3 — documents
// ---------------------------------------------------------------------------

/** Where a document sits in the Reader triage flow. */
export type ReaderLocation = "new" | "later" | "shortlist" | "archive" | "feed";

/**
 * The locations `POST /v3/save/` and `PATCH /v3/update/` accept. `shortlist` is
 * a valid *filter* but is not settable through the API — a real asymmetry, and
 * the reason this is a separate type rather than a subset used by convention.
 */
export type WritableLocation = Exclude<ReaderLocation, "shortlist">;

export type ReaderCategory =
  | "article"
  | "email"
  | "rss"
  | "highlight"
  | "note"
  | "pdf"
  | "epub"
  | "tweet"
  | "video";

/** A tag as it appears on a document (the API returns an object, not an array). */
export interface ReaderDocumentTag {
  name: string;
  type?: string;
  created?: number;
}

/** A document as returned by `GET /v3/list/`. */
export interface ReaderDocument {
  id: string;
  /** The Reader deep link, with the triage location embedded in its path. */
  url: string;
  /** The original URL the document was saved from. */
  source_url: string;
  title: string;
  author: string;
  source?: string;
  category: ReaderCategory;
  location: ReaderLocation;
  /** Keyed by tag key; empty object when untagged. */
  tags?: Record<string, ReaderDocumentTag>;
  site_name?: string;
  word_count?: number;
  reading_time?: string;
  listening_time?: string | null;
  created_at: string;
  updated_at: string;
  /** The document-level note (not a highlight's note). */
  notes?: string;
  published_date?: string | null;
  summary?: string;
  image_url?: string;
  /** Set on highlights and notes; null on real documents. */
  parent_id?: string | null;
  reading_progress?: number;
  first_opened_at?: string | null;
  last_opened_at?: string | null;
  saved_at?: string;
  last_moved_at?: string;
}

/** The `GET /v3/list/` envelope. */
export interface ListDocumentsResponse {
  count: number;
  nextPageCursor?: string | null;
  results: ReaderDocument[];
}

/** Query parameters for `GET /v3/list/`. */
export interface ListDocumentsParams {
  id?: string;
  updatedAfter?: string;
  location?: ReaderLocation;
  category?: ReaderCategory;
  /** Up to five; a document must carry all of them. */
  tag?: string[];
  /** 1–100; the API defaults to 100, which is what we always want. */
  limit?: number;
  pageCursor?: string;
}

/** The request body for `POST /v3/save/`. */
export interface SaveDocumentBody {
  url: string;
  html?: string;
  should_clean_html?: boolean;
  title?: string;
  author?: string;
  summary?: string;
  language?: string;
  published_date?: string;
  image_url?: string;
  location?: WritableLocation;
  category?: ReaderCategory;
  saved_using?: string;
  tags?: string[];
  notes?: string;
}

/** What `POST /v3/save/` returns, for both the created and the existing case. */
export interface SavedDocument {
  id: string;
  url: string;
}

/** A tag from `GET /v3/tags/`. */
export interface ReaderTag {
  key: string;
  name: string;
}

export interface ListTagsResponse {
  count: number;
  nextPageCursor?: string | null;
  results: ReaderTag[];
}

// ---------------------------------------------------------------------------
// Readwise v2 — the highlight export (the plugin's highlight source, R3)
// ---------------------------------------------------------------------------

export interface ExportTag {
  id: number;
  name: string;
}

/** A single highlight, as nested inside its book by `GET /v2/export/`. */
export interface ExportedHighlight {
  id: number;
  text: string;
  /** The user's note on this highlight, or null. */
  note: string | null;
  /** Position within the source — the plugin's primary sort key. */
  location: number | null;
  location_type?: string;
  /** Readwise's own colour. Deliberately unused: colour comes from tags (R6). */
  color: string | null;
  highlighted_at: string | null;
  created_at?: string;
  updated_at?: string;
  url?: string | null;
  book_id?: number;
  tags?: ExportTag[];
  readwise_url?: string;
}

/** A source with all of its highlights, as returned by `GET /v2/export/`. */
export interface ExportedBook {
  user_book_id: number;
  title: string;
  author: string | null;
  readable_title?: string;
  source?: string;
  cover_image_url?: string;
  /**
   * For a document read in Reader this is expected to be its Reader deep link,
   * which is how a book joins to a binding. Unverified against a live account —
   * `source_url` is the designed fallback (see docs/api-notes.md).
   */
  unique_url: string | null;
  summary?: string | null;
  book_tags?: ExportTag[];
  category?: string;
  document_note?: string | null;
  readwise_url?: string;
  /** The original URL the source was saved from. */
  source_url: string | null;
  asin?: string | null;
  highlights: ExportedHighlight[];
}

export interface ExportResponse {
  count: number;
  nextPageCursor?: string | null;
  results: ExportedBook[];
}
