// Pure helpers for translating between Readwise Reader document ids and the
// deep-link URLs the plugin embeds in notes. No Obsidian dependency → fully
// unit-tested.
//
// Reader document URLs embed the document's *triage location* in the path:
//
//   https://read.readwise.io/new/read/01gkqtdz9xabcd5gt96khreyb
//   https://read.readwise.io/archive/read/01gkqtdz9xabcd5gt96khreyb
//
// The location changes when the user triages the document in Reader — the id
// does not. So the two directions are deliberately asymmetric (R10):
//
//   build  → the canonical, location-free form, so a binding written into a
//            note stays accurate for the life of the document;
//   parse  → permissive: any (or no) location segment, either host, any id
//            length, plus trailing slash / query / fragment.
//
// Ids are opaque and NOT fixed-length (documented examples run 25–28 chars), so
// nothing here may assume a length.

/** Canonical host for Reader deep links. */
export const READER_HOST = "read.readwise.io";

/** Hosts a binding href may legitimately use. */
const BINDING_HOSTS = new Set([READER_HOST, "readwise.io"]);

/** Triage locations Reader may put in a document URL's path. */
const LOCATION_SEGMENTS = new Set([
  "new",
  "later",
  "shortlist",
  "archive",
  "feed",
]);

/** A Reader document id: opaque, alphanumeric, variable length. */
const DOCUMENT_ID = /^[0-9a-zA-Z]+$/;

/** Build the canonical, location-free deep link for a document id. */
export function buildDeepLink(id: string): string {
  return `https://${READER_HOST}/read/${id}`;
}

/**
 * Extract the Reader document id from a binding href, or `null` if the href is
 * not a Reader document link. Accepts an optional leading location segment
 * (`/new/read/<id>`, `/archive/read/<id>`, …) as well as the canonical
 * `/read/<id>`, on either the `read.readwise.io` or `readwise.io` host, and is
 * tolerant of trailing slashes, query strings and fragments.
 */
export function parseBindingId(href: string): string | null {
  let path: string;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!BINDING_HOSTS.has(url.host.toLowerCase())) return null;
    path = url.pathname;
  } catch {
    return null;
  }

  const segments = path.split("/").filter((s) => s !== "");

  // Drop an optional leading triage location, then require `read/<id>`.
  if (segments.length > 0 && LOCATION_SEGMENTS.has(segments[0])) {
    segments.shift();
  }
  if (segments.length !== 2 || segments[0] !== "read") return null;

  const id = segments[1];
  return DOCUMENT_ID.test(id) ? id : null;
}
