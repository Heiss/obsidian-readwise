// Extract external links from a note body. Obsidian's `metadataCache` does not
// index external URLs, so the plugin parses them out of the raw markdown. Code
// fences, inline code, wikilinks/embeds and image embeds are masked out first;
// the parsing may be fuzzy because a checkbox confirmation (F3) or an index
// lookup (F2) is the safety net. No Obsidian dependency → unit-tested.

import { parseBindingId } from "./urls";

export type LinkKind = "markdown" | "bare";

export interface ParsedLink {
  kind: LinkKind;
  /** Link text for markdown links; `null` for a bare url. */
  text: string | null;
  /** The (external, http/https) target url. */
  url: string;
  /** Offset of the whole construct in the source markdown. */
  start: number;
  end: number;
  /** Offset of just the url substring (for in-place rewriting). */
  urlStart: number;
  urlEnd: number;
}

export interface Binding extends ParsedLink {
  /** The Reader document id carried in the href. */
  id: string;
}

/** Replace `[start, end)` in a char array with spaces, preserving newlines. */
function blank(chars: string[], start: number, end: number): void {
  for (let i = start; i < end && i < chars.length; i++) {
    if (chars[i] !== "\n") chars[i] = " ";
  }
}

/** Blank every match of `regex` (which must be global) in the working buffer. */
function maskAll(source: string, chars: string[], regex: RegExp): void {
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    blank(chars, m.index, m.index + m[0].length);
    if (m[0].length === 0) regex.lastIndex++;
  }
}

const FENCED_CODE = /(?:```|~~~)[\s\S]*?(?:```|~~~)/g;
const INLINE_CODE = /`[^`\n]+`/g;
const WIKI = /!?\[\[[^\]]*\]\]/g;
// Markdown links and image embeds: an optional leading `!`, `[text]`, `(target)`.
const MD_LINK = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
const BARE_URL = /https?:\/\/[^\s<>()[\]]+/g;

function isHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Trim a trailing markdown link title and stray punctuation from a url. */
function cleanTarget(raw: string): string {
  // `(url "title")` → drop the title.
  const url = raw.trim().split(/\s+/, 1)[0];
  return url;
}

/**
 * Extract external http/https links from a note body, in reading order,
 * excluding code, wikilinks and image embeds. Positions refer to the original
 * (unmasked) string so callers can rewrite in place.
 */
export function extractLinks(markdown: string): ParsedLink[] {
  const chars = markdown.split("");

  // Mask regions that must never yield links. Order matters: fenced code first.
  maskAll(markdown, chars, FENCED_CODE);
  maskAll(markdown, chars, INLINE_CODE);
  maskAll(markdown, chars, WIKI);

  const masked = chars.join("");
  const results: ParsedLink[] = [];

  // Markdown links / image embeds. Skip images; blank consumed spans so the
  // bare-url pass does not re-match the target inside them.
  const consumed = masked.split("");
  MD_LINK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_LINK.exec(masked)) !== null) {
    const [whole, bang, text, target] = m;
    const start = m.index;
    const end = start + whole.length;
    blank(consumed, start, end);
    if (bang === "!") continue; // image embed → excluded
    const url = cleanTarget(target);
    if (!isHttp(url)) continue;
    // Locate the url substring within the original for an exact span.
    const targetOffset = start + whole.indexOf(target);
    results.push({
      kind: "markdown",
      text,
      url,
      start,
      end,
      urlStart: targetOffset,
      urlEnd: targetOffset + url.length,
    });
  }

  // Bare urls in whatever text is left.
  const remaining = consumed.join("");
  BARE_URL.lastIndex = 0;
  while ((m = BARE_URL.exec(remaining)) !== null) {
    const url = m[0];
    if (!isHttp(url)) continue;
    results.push({
      kind: "bare",
      text: null,
      url,
      start: m.index,
      end: m.index + url.length,
      urlStart: m.index,
      urlEnd: m.index + url.length,
    });
  }

  results.sort((a, b) => a.start - b.start);
  return results;
}

/**
 * Extract the subset of links that are Reader bindings, deduped by document id
 * (first occurrence wins), in reading order.
 */
export function extractBindings(markdown: string): Binding[] {
  const seen = new Set<string>();
  const bindings: Binding[] = [];
  for (const link of extractLinks(markdown)) {
    const id = parseBindingId(link.url);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    bindings.push({ ...link, id });
  }
  return bindings;
}
