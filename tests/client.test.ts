import { describe, it, expect } from "vitest";
import { ReadwiseClient } from "../src/api/client";
import type { HttpClient, HttpRequest, HttpResponse } from "../src/api/http";

interface Call {
  req: HttpRequest;
}

/**
 * A fake HttpClient that replays queued responses. Like the real adapter it
 * resolves for every status — the client interprets status codes itself, which
 * is what the 200-vs-201 and 429 paths depend on.
 */
function fakeHttp(responses: HttpResponse[]): {
  http: HttpClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const queue = [...responses];
  const http: HttpClient = async (req) => {
    calls.push({ req });
    const next = queue.shift();
    if (!next) throw new Error("fake http: no response queued");
    return next;
  };
  return { http, calls };
}

/** A client whose waits are recorded instead of slept through. */
function clientWith(responses: HttpResponse[], token = "tok") {
  const { http, calls } = fakeHttp(responses);
  const slept: number[] = [];
  const client = new ReadwiseClient(http, {
    token,
    sleep: async (ms) => void slept.push(ms),
  });
  return { client, calls, slept };
}

describe("auth", () => {
  it("sends the Readwise Token scheme, not Bearer", async () => {
    const { client, calls } = clientWith([{ status: 204 }]);
    await client.checkConnection();
    expect(calls[0].req.headers?.Authorization).toBe("Token tok");
  });

  it("treats 204 from /v2/auth/ as connected", async () => {
    const { client, calls } = clientWith([{ status: 204 }]);
    const result = await client.checkConnection();
    expect(result.ok).toBe(true);
    expect(calls[0].req.url).toBe("https://readwise.io/api/v2/auth/");
  });

  it("reports a rejected token distinctly from an unexpected status", async () => {
    const rejected = await clientWith([{ status: 401 }]).client.checkConnection();
    expect(rejected.ok).toBe(false);
    expect(rejected.message).toMatch(/token/i);

    const odd = await clientWith([{ status: 500 }]).client.checkConnection();
    expect(odd.ok).toBe(false);
    expect(odd.message).toMatch(/unexpected/i);
  });

  it("does not throw when the network is unreachable", async () => {
    const http: HttpClient = async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    };
    const client = new ReadwiseClient(http, { token: "t" });
    const result = await client.checkConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/could not reach/i);
  });
});

describe("save", () => {
  const created: HttpResponse = {
    status: 201,
    json: { id: "01abc", url: "https://read.readwise.io/new/read/01abc" },
  };
  const existing: HttpResponse = {
    status: 200,
    json: { id: "01abc", url: "https://read.readwise.io/new/read/01abc" },
  };

  it("reports 201 as newly created", async () => {
    const { client } = clientWith([created]);
    const result = await client.save({ url: "https://example.org/a" });
    expect(result.alreadyExisted).toBe(false);
    expect(result.document.id).toBe("01abc");
  });

  // The whole duplicate story: 200 means it was already in Reader, and the id
  // comes back regardless, so one request always yields a binding.
  it("reports 200 as already existing, with the same id", async () => {
    const { client } = clientWith([existing]);
    const result = await client.save({ url: "https://example.org/a" });
    expect(result.alreadyExisted).toBe(true);
    expect(result.document.id).toBe("01abc");
  });

  it("throws when the response carries no id", async () => {
    const { client } = clientWith([{ status: 201, json: {} }]);
    await expect(client.save({ url: "https://example.org/a" })).rejects.toThrow(
      /no document id/i,
    );
  });

  it("surfaces the server's error text", async () => {
    const { client } = clientWith([
      { status: 400, json: { detail: "url is required" } },
    ]);
    await expect(client.save({ url: "" })).rejects.toThrow(/url is required/);
  });
});

describe("listDocuments", () => {
  it("passes filters through and repeats tag rather than joining it", async () => {
    const { client, calls } = clientWith([
      { status: 200, json: { count: 0, results: [] } },
    ]);
    await client.listDocuments({
      location: "later",
      category: "article",
      limit: 100,
      tag: ["a", "b"],
    });
    const url = new URL(calls[0].req.url);
    expect(url.pathname).toBe("/api/v3/list/");
    expect(url.searchParams.get("location")).toBe("later");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.getAll("tag")).toEqual(["a", "b"]);
  });

  it("normalizes a missing cursor to null so paging can stop on it", async () => {
    const { client } = clientWith([{ status: 200, json: { count: 1, results: [] } }]);
    const page = await client.listDocuments();
    expect(page.nextPageCursor).toBeNull();
  });

  it("throws on a non-2xx status", async () => {
    const { client } = clientWith([{ status: 403, text: "forbidden" }]);
    await expect(client.listDocuments()).rejects.toThrow(/HTTP 403/);
  });
});

describe("exportHighlights", () => {
  it("returns books with their nested highlights", async () => {
    const { client, calls } = clientWith([
      {
        status: 200,
        json: {
          count: 1,
          nextPageCursor: null,
          results: [
            {
              user_book_id: 7,
              title: "On RAG",
              author: "A",
              unique_url: "https://read.readwise.io/read/01abc",
              source_url: "https://example.org/on-rag",
              highlights: [
                { id: 1, text: "one", note: null, location: 3, color: "yellow", highlighted_at: null },
                { id: 2, text: "two", note: "mine", location: 1, color: null, highlighted_at: null },
              ],
            },
          ],
        },
      },
    ]);
    const page = await client.exportHighlights({ updatedAfter: "2026-01-01T00:00:00Z" });
    expect(new URL(calls[0].req.url).searchParams.get("updatedAfter")).toBe(
      "2026-01-01T00:00:00Z",
    );
    expect(page.results[0].highlights).toHaveLength(2);
  });
});

describe("listTags", () => {
  it("follows the cursor to the end", async () => {
    const { client, calls } = clientWith([
      {
        status: 200,
        json: { count: 3, nextPageCursor: "c2", results: [{ key: "a", name: "A" }] },
      },
      {
        status: 200,
        json: { count: 3, nextPageCursor: null, results: [{ key: "b", name: "B" }] },
      },
    ]);
    const tags = await client.listTags();
    expect(tags.map((t) => t.key)).toEqual(["a", "b"]);
    expect(new URL(calls[1].req.url).searchParams.get("pageCursor")).toBe("c2");
  });
});

describe("rate limiting", () => {
  // The limit is per token and shared with the user's other Readwise tools, so
  // a 429 is traffic to absorb rather than an error to surface.
  it("waits for Retry-After and retries a 429", async () => {
    const { client, slept, calls } = clientWith([
      { status: 429, headers: { "retry-after": "7" } },
      { status: 200, json: { count: 0, results: [] } },
    ]);
    await client.listDocuments();
    expect(calls).toHaveLength(2);
    expect(slept).toContain(7000);
  });

  it("gives up rather than retrying a 429 forever", async () => {
    const many: HttpResponse[] = Array.from({ length: 8 }, () => ({
      status: 429,
      headers: { "retry-after": "1" },
    }));
    const { client } = clientWith(many);
    await expect(client.listDocuments()).rejects.toThrow(/HTTP 429/);
  });

  it("counts its own requests, so the sync can report what it cost", async () => {
    const { client } = clientWith([
      { status: 200, json: { count: 0, results: [] } },
      { status: 201, json: { id: "x", url: "https://read.readwise.io/read/x" } },
    ]);
    await client.listDocuments();
    await client.save({ url: "https://example.org/a" });
    expect(client.requestCounts()).toEqual({ read: 1, write: 1 });
  });
});
