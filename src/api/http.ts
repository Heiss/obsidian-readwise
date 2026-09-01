// A minimal HTTP abstraction so the API client stays free of any Obsidian
// dependency and is unit-testable with a fake. In the plugin this is adapted
// onto Obsidian's `requestUrl` (which bypasses CORS at the Electron level).

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  /** Serialized request body (JSON string). */
  body?: string;
}

export interface HttpResponse {
  status: number;
  /** Parsed JSON body, if the response was JSON. */
  json?: unknown;
  /** Raw text body. */
  text?: string;
  /**
   * Response headers, lowercased keys. Only `retry-after` is read today (on a
   * 429), but the client cannot get it any other way.
   */
  headers?: Record<string, string>;
}

/**
 * Performs an HTTP request. Implementations MUST resolve for any HTTP status
 * (including 4xx/5xx) rather than throwing, so the client can interpret status
 * codes itself. They should reject only on genuine network/transport failure.
 */
export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;
