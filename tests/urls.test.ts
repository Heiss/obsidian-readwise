import { describe, it, expect } from "vitest";
import { buildDeepLink, parseBindingId } from "../src/core/urls";

const ID = "01gkqtdz9xabcd5gt96khreyb";

describe("buildDeepLink", () => {
  it("emits the canonical, location-free form", () => {
    expect(buildDeepLink(ID)).toBe(`https://read.readwise.io/read/${ID}`);
  });

  it("round-trips through the parser", () => {
    expect(parseBindingId(buildDeepLink(ID))).toBe(ID);
  });
});

describe("parseBindingId", () => {
  it("parses the canonical form", () => {
    expect(parseBindingId(`https://read.readwise.io/read/${ID}`)).toBe(ID);
  });

  // Reader puts the document's triage location in the path, and it changes when
  // the user triages the document. Every variant must resolve to the same id, or
  // archiving an article in Reader would silently break its binding.
  it.each(["new", "later", "shortlist", "archive", "feed"])(
    "parses a url carrying the %s location segment",
    (location) => {
      expect(
        parseBindingId(`https://read.readwise.io/${location}/read/${ID}`),
      ).toBe(ID);
    },
  );

  it("accepts the readwise.io host as well as read.readwise.io", () => {
    expect(parseBindingId(`https://readwise.io/new/read/${ID}`)).toBe(ID);
  });

  it("tolerates a trailing slash, query string and fragment", () => {
    expect(parseBindingId(`https://read.readwise.io/read/${ID}/`)).toBe(ID);
    expect(parseBindingId(`https://read.readwise.io/read/${ID}?x=1`)).toBe(ID);
    expect(parseBindingId(`https://read.readwise.io/read/${ID}#top`)).toBe(ID);
  });

  // Ids are opaque and NOT fixed-length: the documented examples run 25-28
  // characters, so nothing may assume a length.
  it.each(["0000ffff2222eeee3333dddd4444", "01gwfvp9pyaabcdgmx14f6ha0", "abc123"])(
    "accepts the variable-length id %s",
    (id) => {
      expect(parseBindingId(`https://read.readwise.io/read/${id}`)).toBe(id);
    },
  );

  it("rejects a foreign host", () => {
    expect(parseBindingId(`https://evil.tld/read/${ID}`)).toBeNull();
    expect(parseBindingId(`https://readwise.io.evil.tld/read/${ID}`)).toBeNull();
  });

  it("rejects a Readwise url that is not a document link", () => {
    expect(parseBindingId("https://readwise.io/access_token")).toBeNull();
    expect(parseBindingId(`https://read.readwise.io/${ID}`)).toBeNull();
    expect(parseBindingId("https://read.readwise.io/read/")).toBeNull();
    expect(parseBindingId(`https://read.readwise.io/read/${ID}/extra`)).toBeNull();
  });

  it("rejects an id with characters an id cannot contain", () => {
    expect(parseBindingId("https://read.readwise.io/read/has-a-hyphen")).toBeNull();
    expect(parseBindingId("https://read.readwise.io/read/has_underscore")).toBeNull();
  });

  it("rejects a non-url", () => {
    expect(parseBindingId("not a url")).toBeNull();
    expect(parseBindingId("")).toBeNull();
    expect(parseBindingId(`ftp://read.readwise.io/read/${ID}`)).toBeNull();
  });
});
