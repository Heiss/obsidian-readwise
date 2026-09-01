// Colour semantics for highlights (R6).
//
// The Readwise Reader API exposes no highlight colour, so colour is derived from
// *tags* instead: the user says which tag means which colour, and anything that
// matches no rule gets the default.
//
// This is an ordered LIST, not a keyed map — the difference matters. A highlight
// can carry several tags, so a `Record<tag, rule>` would make the outcome depend
// on object key order, which is invisible until two rules disagree. First match
// in the user's own order wins, and the settings UI lets rows be reordered.
//
// Pure, no Obsidian import → unit-tested.

export interface ColorRule {
  /** The Readwise tag this rule matches, compared case-insensitively. */
  tag: string;
  /** Any CSS colour; drives the panel's colour bar. */
  color: string;
  /** Obsidian callout type used when inserting the highlight as a quote (F4). */
  callout: string;
  /** Optional Obsidian tag appended to the inserted callout. */
  noteTag?: string;
}

/** What a highlight resolves to once the rules have been applied. */
export interface ResolvedColor {
  color: string;
  callout: string;
  noteTag?: string;
  /** The rule's tag, or null when the default was used. */
  matched: string | null;
}

/** Used for any highlight matching no rule. Yellow is Readwise's own default. */
export const DEFAULT_COLOR: ResolvedColor = {
  color: "#e6b800",
  callout: "quote",
  matched: null,
};

/**
 * A starting point, not a prescription — every row is editable and removable in
 * settings. Chosen to be recognisable rather than clever.
 */
export const DEFAULT_COLOR_RULES: ColorRule[] = [
  { tag: "definition", color: "#3b82f6", callout: "info", noteTag: "definition" },
  { tag: "objection", color: "#ef4444", callout: "warning", noteTag: "objection" },
  { tag: "idea", color: "#22c55e", callout: "success", noteTag: "idea" },
];

function normalize(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Resolve a highlight's colour from its tags.
 *
 * `highlightTags` is consulted before `bookTags`: a tag on the highlight itself
 * is a statement about that passage, while a tag on the source is a statement
 * about the whole document. Falling back to the source keeps the feature useful
 * for people who tag documents rather than individual highlights.
 */
export function resolveColor(
  rules: readonly ColorRule[],
  highlightTags: readonly string[] = [],
  bookTags: readonly string[] = [],
  fallback: ResolvedColor = DEFAULT_COLOR,
): ResolvedColor {
  for (const source of [highlightTags, bookTags]) {
    const present = new Set(source.map(normalize));
    if (present.size === 0) continue;
    for (const rule of rules) {
      if (present.has(normalize(rule.tag))) {
        return {
          color: rule.color,
          callout: rule.callout,
          noteTag: rule.noteTag,
          matched: rule.tag,
        };
      }
    }
  }
  return fallback;
}
