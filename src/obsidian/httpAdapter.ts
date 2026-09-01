// Adapts Obsidian's `requestUrl` onto the plugin's HttpClient interface.
// `requestUrl` bypasses CORS at the Electron level (unlike `fetch`), and we set
// `throw: false` so the client can interpret HTTP status codes itself.

import { requestUrl } from "obsidian";
import type { HttpClient } from "../api/http";

export const obsidianHttp: HttpClient = async (req) => {
  const res = await requestUrl({
    url: req.url,
    method: req.method ?? "GET",
    headers: req.headers,
    body: req.body,
    throw: false,
  });

  // `res.json` throws if the body is not JSON; guard it.
  let json: unknown;
  try {
    json = res.json;
  } catch {
    json = undefined;
  }

  // Obsidian returns headers with their original casing; normalize so the
  // client can read `retry-after` without guessing how the server spelled it.
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(res.headers ?? {})) {
    headers[key.toLowerCase()] = value;
  }

  return { status: res.status, json, text: res.text, headers };
};
