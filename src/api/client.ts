// The Readwise API client. Deliberately free of any Obsidian dependency: it
// takes an injected `HttpClient` so it can be unit-tested with a fake, and is
// adapted onto Obsidian's `requestUrl` in the plugin itself.
//
// It speaks two APIs behind one access token:
//   Reader v3   (`/api/v3/…`) — documents: list, save, tags
//   Readwise v2 (`/api/v2/…`) — `auth/` for the token check, `export/` for
//                               highlights (R3: cheaper and richer than paging
//                               Reader's own highlight documents)
//
// Rate limits are per token and per endpoint, so reads and writes get separate
// budgets and every call goes through one of them.

import type { HttpClient, HttpRequest, HttpResponse } from "./http";
import {
  RateLimiter,
  retryAfterMs,
  READ_LIMIT_PER_MINUTE,
  WRITE_LIMIT_PER_MINUTE,
} from "../core/rateLimit";
import type {
  ExportResponse,
  ListDocumentsParams,
  ListDocumentsResponse,
  ListTagsResponse,
  ReaderTag,
  SaveDocumentBody,
  SavedDocument,
} from "./models";

export const DEFAULT_API_BASE = "https://readwise.io/api";

export interface ClientConfig {
  /** Readwise access token, sent as a `Token` credential. */
  token: string;
  /** API base; overridden only by the example vault's mock server. */
  apiBase?: string;
  /** Injected for tests; production waits for real time. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Outcome of a `checkConnection` probe. */
export interface ConnectionCheck {
  ok: boolean;
  /** HTTP status, when a response was received (absent on transport failure). */
  status?: number;
  /** Human-readable summary suitable for showing in settings. */
  message: string;
}

/** Outcome of a `save` call. */
export interface SaveResult {
  document: SavedDocument;
  /**
   * True when the server reported the URL was already in Reader (HTTP 200
   * rather than 201). Both cases carry the id, so this is informational — the
   * binding is available either way, in one request.
   */
  alreadyExisted: boolean;
}

/** How many HTTP requests this client has made, for the sync's cost reporting. */
export interface RequestCounts {
  read: number;
  write: number;
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function normalizeBase(base: string): string {
  return base.trim().replace(/\/+$/, "");
}

/** Extract a parsed JSON body from a response, falling back to parsing `text`. */
function readJson(res: HttpResponse): unknown {
  if (res.json !== undefined) return res.json;
  if (res.text) {
    try {
      return JSON.parse(res.text);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Best-effort human-readable error message from a response. */
function errorMessage(res: HttpResponse): string {
  const parsed = readJson(res) as { detail?: unknown; error?: unknown } | undefined;
  if (parsed && typeof parsed.detail === "string") return parsed.detail;
  if (parsed && typeof parsed.error === "string") return parsed.error;
  if (res.text) return res.text.slice(0, 200);
  return "unknown error";
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

/** Give up rather than retry a rate limit forever. */
const MAX_RETRIES = 3;

export class ReadwiseClient {
  private readonly base: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly reads: RateLimiter;
  private readonly writes: RateLimiter;
  private readonly counts: RequestCounts = { read: 0, write: 0 };

  constructor(
    private readonly http: HttpClient,
    private readonly config: ClientConfig,
  ) {
    this.base = normalizeBase(config.apiBase ?? DEFAULT_API_BASE);
    this.sleep = config.sleep ?? defaultSleep;
    const now = config.now;
    this.reads = new RateLimiter(READ_LIMIT_PER_MINUTE, 60_000, now);
    this.writes = new RateLimiter(WRITE_LIMIT_PER_MINUTE, 60_000, now);
  }

  /** Requests made so far, so the sync can report what it cost. */
  requestCounts(): RequestCounts {
    return { ...this.counts };
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Token ${this.config.token}` };
  }

  /**
   * Perform a request against the configured budget, honouring `Retry-After` on
   * a 429. The limit is per token and shared with the user's other Readwise
   * tools, so a 429 is expected traffic, not an error — we wait and retry.
   */
  private async request(
    req: HttpRequest,
    kind: "read" | "write",
  ): Promise<HttpResponse> {
    const limiter = kind === "read" ? this.reads : this.writes;

    for (let attempt = 0; ; attempt++) {
      const wait = limiter.reserve();
      if (wait > 0) await this.sleep(wait);

      this.counts[kind] += 1;
      const res = await this.http(req);

      if (res.status !== 429 || attempt >= MAX_RETRIES) return res;

      // Drain the budget we clearly do not have, then wait as instructed.
      const retryAfter = retryAfterMs(res.headers?.["retry-after"]);
      await this.sleep(retryAfter ?? 60_000);
    }
  }

  private url(path: string, query?: URLSearchParams): string {
    const qs = query?.toString();
    return `${this.base}${path}${qs ? `?${qs}` : ""}`;
  }

  /**
   * Probe the token with `GET /v2/auth/`, which answers 204 for a valid token.
   * Classifies the result rather than throwing, so settings can show it inline.
   */
  async checkConnection(): Promise<ConnectionCheck> {
    let res: HttpResponse;
    try {
      res = await this.request(
        { url: this.url("/v2/auth/"), method: "GET", headers: this.authHeaders() },
        "read",
      );
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `Could not reach Readwise — ${detail}` };
    }
    if (isSuccess(res.status)) {
      return { ok: true, status: res.status, message: "Connected." };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        message: `Readwise rejected the token (HTTP ${res.status}). Check that it was copied in full from readwise.io/access_token.`,
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        status: res.status,
        message:
          "Rate limited by Readwise. The token is shared with your other Readwise tools — wait a minute and try again.",
      };
    }
    return {
      ok: false,
      status: res.status,
      message: `Unexpected response from Readwise (HTTP ${res.status}).`,
    };
  }

  /** GET /v3/list/ — one page of documents. */
  async listDocuments(
    params: ListDocumentsParams = {},
  ): Promise<ListDocumentsResponse> {
    const query = new URLSearchParams();
    if (params.id) query.set("id", params.id);
    if (params.updatedAfter) query.set("updatedAfter", params.updatedAfter);
    if (params.location) query.set("location", params.location);
    if (params.category) query.set("category", params.category);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.pageCursor) query.set("pageCursor", params.pageCursor);
    // `tag` repeats rather than joining: a document must carry all of them.
    for (const tag of params.tag ?? []) query.append("tag", tag);

    const res = await this.request(
      { url: this.url("/v3/list/", query), method: "GET", headers: this.authHeaders() },
      "read",
    );
    if (!isSuccess(res.status)) {
      throw new Error(
        `Readwise listDocuments failed (HTTP ${res.status}): ${errorMessage(res)}`,
      );
    }
    const body = readJson(res) as Partial<ListDocumentsResponse> | undefined;
    return {
      count: body?.count ?? 0,
      nextPageCursor: body?.nextPageCursor ?? null,
      results: body?.results ?? [],
    };
  }

  /** GET /v2/export/ — one page of sources, each with all of its highlights. */
  async exportHighlights(
    params: { updatedAfter?: string; pageCursor?: string } = {},
  ): Promise<ExportResponse> {
    const query = new URLSearchParams();
    if (params.updatedAfter) query.set("updatedAfter", params.updatedAfter);
    if (params.pageCursor) query.set("pageCursor", params.pageCursor);

    const res = await this.request(
      { url: this.url("/v2/export/", query), method: "GET", headers: this.authHeaders() },
      "read",
    );
    if (!isSuccess(res.status)) {
      throw new Error(
        `Readwise export failed (HTTP ${res.status}): ${errorMessage(res)}`,
      );
    }
    const body = readJson(res) as Partial<ExportResponse> | undefined;
    return {
      count: body?.count ?? 0,
      nextPageCursor: body?.nextPageCursor ?? null,
      results: body?.results ?? [],
    };
  }

  /** GET /v3/tags/ — every tag, following the cursor. */
  async listTags(): Promise<ReaderTag[]> {
    const out: ReaderTag[] = [];
    let cursor: string | undefined;

    do {
      const query = new URLSearchParams();
      if (cursor) query.set("pageCursor", cursor);
      const res = await this.request(
        { url: this.url("/v3/tags/", query), method: "GET", headers: this.authHeaders() },
        "read",
      );
      if (!isSuccess(res.status)) {
        throw new Error(
          `Readwise listTags failed (HTTP ${res.status}): ${errorMessage(res)}`,
        );
      }
      const body = readJson(res) as Partial<ListTagsResponse> | undefined;
      out.push(...(body?.results ?? []));
      cursor = body?.nextPageCursor ?? undefined;
    } while (cursor);

    return out;
  }

  /**
   * POST /v3/save/ — save a URL to Reader.
   *
   * The endpoint is idempotent by URL: 201 means created, 200 means it was
   * already there, and both return `{ id, url }`. That is the whole duplicate
   * story — no prerequisite setting, no follow-up search.
   */
  async save(body: SaveDocumentBody): Promise<SaveResult> {
    const res = await this.request(
      {
        url: this.url("/v3/save/"),
        method: "POST",
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "write",
    );

    if (!isSuccess(res.status)) {
      throw new Error(
        `Readwise save failed (HTTP ${res.status}): ${errorMessage(res)}`,
      );
    }

    const parsed = readJson(res) as Partial<SavedDocument> | undefined;
    if (!parsed?.id || !parsed.url) {
      throw new Error("Readwise save returned no document id.");
    }
    return {
      document: { id: parsed.id, url: parsed.url },
      alreadyExisted: res.status === 200,
    };
  }
}
