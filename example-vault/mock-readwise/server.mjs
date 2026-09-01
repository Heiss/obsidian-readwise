#!/usr/bin/env node
// A tiny, dependency-free mock of the Readwise endpoints the plugin uses, so
// the example vault demonstrates the plugin end to end without a Readwise
// account. It does NOT check auth. Port via the PORT env var (8788).
//
// The shapes here are the contract the plugin is written against. When the
// checklist in docs/api-notes.md is run against a real token, correct this file
// and tests/fixtures/ together — a mock that drifts from reality is worse than
// no mock, because the whole suite stays green against a fiction.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8788);

// The fixtures are the single source of truth for these shapes: the unit tests
// parse the same files. A mock with its own idea of a highlight would let the
// whole suite pass green against a fiction.
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../tests/fixtures");
const load = (name) => JSON.parse(readFileSync(join(fixtures, name), "utf8"));

const documentsPage = load("documents.json");
const exportPage = load("export.json");
const tagsPage = load("tags.json");

const documents = documentsPage.results;
const books = exportPage.results;
const tags = tagsPage.results;

const DOC_RAG = "01gkqtdz9xabcd5gt96khreyb";
const DOC_ORDER = "01gwfvp9pyaabcdgmx14f6ha0";
const DOC_UNREAD = "01h6qabyzghazrt1qsjvf9zeqa";

/** URLs already "in Reader", so the 200-vs-201 split can be demonstrated. */
const savedUrls = new Map(documents.map((d) => [d.source_url, d.id]));

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === "/api/v2/auth/") {
    res.writeHead(204);
    return res.end();
  }

  if (path === "/api/v2/export/") {
    return json(res, 200, {
      count: books.length,
      nextPageCursor: null,
      results: books,
    });
  }

  if (path === "/api/v3/tags/") {
    return json(res, 200, { count: tags.length, nextPageCursor: null, results: tags });
  }

  if (path === "/api/v3/list/") {
    const id = url.searchParams.get("id");
    const location = url.searchParams.get("location");
    let results = documents;
    if (id) results = results.filter((d) => d.id === id);
    if (location) results = results.filter((d) => d.location === location);
    return json(res, 200, {
      count: results.length,
      nextPageCursor: null,
      results,
    });
  }

  if (path === "/api/v3/save/" && req.method === "POST") {
    const body = await readBody(req);
    const target = body.url ?? "";
    const existing = savedUrls.get(target);
    if (existing) {
      // 200 = the document was already there; the id comes back either way.
      return json(res, 200, {
        id: existing,
        url: `https://read.readwise.io/new/read/${existing}`,
      });
    }
    const id = `01mock${Math.random().toString(36).slice(2, 12)}`;
    savedUrls.set(target, id);
    return json(res, 201, {
      id,
      url: `https://read.readwise.io/new/read/${id}`,
    });
  }

  json(res, 404, { detail: `No mock route for ${req.method} ${path}` });
});

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

server.listen(PORT, () => {
  console.log(`mock Readwise listening on http://localhost:${PORT}/api`);
});
