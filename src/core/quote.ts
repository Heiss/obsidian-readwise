// Rendering a highlight as an Obsidian callout (F4), plus the blank-line rules
// that keep the callout its own block wherever the cursor happens to be.
// Pure → unit-tested.

import { resolveColor, type ColorRule, type ResolvedColor } from "./colorRules";
import type { IndexedHighlight } from "./index";

/** The Obsidian block id for a highlight. */
export function blockId(highlightId: string): string {
  return `rw-${highlightId}`;
}

/**
 * True if the note already contains this highlight's block id.
 *
 * The right-hand boundary is load-bearing: Readwise ids are not fixed-length, so
 * `^rw-12` must not match inside `^rw-1234`.
 */
export function hasBlockId(noteText: string, highlightId: string): boolean {
  const escaped = highlightId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\^rw-${escaped}(?![0-9a-zA-Z])`).test(noteText);
}

/** Whitespace-only (or empty) is a blank line in Markdown. */
function isBlank(line: string): boolean {
  return line.trim() === "";
}

/**
 * Newlines to insert *before* a block so it starts its own blank-line-separated
 * block. A callout glued to the previous line is absorbed into it.
 */
export function blockSeparatorBefore(before: string): string {
  if (before === "") return "";
  const lines = before.split("\n");
  const current = lines[lines.length - 1];
  const previous = lines.length >= 2 ? lines[lines.length - 2] : "";
  if (!isBlank(current)) return "\n\n";
  if (isBlank(previous)) return "";
  return "\n";
}

/**
 * Newlines to insert *after* a block, so following content is not lazily pulled
 * into it.
 */
export function blockSeparatorAfter(after: string): string {
  if (after === "") return "\n";
  if (after.startsWith("\n")) return "\n";
  return "\n\n";
}

export interface QuoteOptions {
  rules: readonly ColorRule[];
  defaultColor: ResolvedColor;
  /** Tags of the highlight's source, the fallback for colour resolution. */
  bookTags: readonly string[];
  /** The binding href, so the quote carries its provenance. */
  sourceHref: string;
  sourceLabel: string;
}

/** Render a highlight as a callout block (no trailing newline). */
export function formatQuote(
  highlight: IndexedHighlight,
  options: QuoteOptions,
): string {
  const resolved = resolveColor(
    options.rules,
    highlight.tags,
    options.bookTags,
    options.defaultColor,
  );
  const idSuffix = ` ^${blockId(highlight.id)}`;

  let title = `> [!${resolved.callout}] [${options.sourceLabel}](${options.sourceHref})`;
  if (resolved.noteTag) title += ` #${resolved.noteTag}`;

  const note = highlight.note?.trim() ? highlight.note.trim() : null;
  const lines = [title, ...highlight.text.split("\n").map((l) => `> ${l}`)];

  if (note) {
    lines.push(">");
    lines.push(`> **Note:** ${note}${idSuffix}`);
  } else {
    lines[lines.length - 1] = `${lines[lines.length - 1]}${idSuffix}`;
  }

  return lines.join("\n");
}
