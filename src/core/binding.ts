// Pure helpers for producing the Markdown binding link (F1/F3). The link text is
// a human-readable fallback; the href carries the id (single source of truth).

/** The minimum a source needs to produce a readable label. */
export interface Labelable {
  id: string;
  title?: string;
  sourceUrl?: string;
}

/**
 * Choose a readable label for a source: its title, else its original URL, else
 * its id. The label is the note's fallback when Readwise is unreachable — and
 * because Reader deep links require the owner's login, it is also all a *reader*
 * of a shared vault ever sees. Never degrade it to a bare id when a title or URL
 * is available.
 */
export function documentLabel(doc: Labelable): string {
  const title = doc.title?.trim();
  if (title) return title;
  const url = doc.sourceUrl?.trim();
  if (url) return url;
  return doc.id;
}

/** Escape a label so it is safe inside `[...]` of a Markdown link. */
export function escapeLabel(label: string): string {
  return label.replace(/[[\]]/g, "\\$&").replace(/\r?\n/g, " ").trim();
}

/** Build the Markdown binding link `[label](href)`. */
export function formatBindingLink(label: string, href: string): string {
  return `[${escapeLabel(label)}](${href})`;
}
