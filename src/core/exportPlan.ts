// Classify a note's external links for the F3 export modal, and rewrite them to
// bindings once archived. Pure → unit-tested.

import { formatBindingLink } from "./binding";
import { extractLinks, type ParsedLink } from "./links";
import { parseBindingId } from "./urls";

export interface ExportItem {
  link: ParsedLink;
  /** Already a Reader binding → shown grayed, not preselected. */
  alreadyLinked: boolean;
  /** Readable label: the link text, else the url. */
  label: string;
}

/** Build the export item list for a note body, in reading order. */
export function buildExportItems(markdown: string): ExportItem[] {
  return extractLinks(markdown).map((link) => ({
    link,
    alreadyLinked: parseBindingId(link.url) !== null,
    label: (link.text && link.text.trim()) || link.url,
  }));
}

/** A single link → binding rewrite: swap the target for the deep-link href. */
export interface Rewrite {
  link: ParsedLink;
  /** The binding deep-link href to point at. */
  href: string;
  /** Label used when wrapping a bare url that has no text of its own. */
  fallbackLabel: string;
}

/**
 * Apply a batch of rewrites to `text` and return the new text. Rewrites are
 * applied from the end of the document backwards so earlier offsets stay valid.
 * A markdown link keeps its text and swaps only the url; a bare url is wrapped
 * into a `[label](href)` binding.
 */
export function applyRewrites(text: string, rewrites: Rewrite[]): string {
  const ordered = [...rewrites].sort((a, b) => b.link.start - a.link.start);
  let out = text;
  for (const { link, href, fallbackLabel } of ordered) {
    if (link.kind === "markdown") {
      out = out.slice(0, link.urlStart) + href + out.slice(link.urlEnd);
    } else {
      const replacement = formatBindingLink(link.url || fallbackLabel, href);
      out = out.slice(0, link.start) + replacement + out.slice(link.end);
    }
  }
  return out;
}
