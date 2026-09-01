// English string table — the source of truth. `de.ts` mirrors its shape, and a
// unit test asserts the two never drift apart.

export const en = {
  plugin: {
    notConfigured:
      "Readwise Reader: add your access token in the plugin settings first.",
  },
  settings: {
    tokenName: "Access token",
    tokenIntro:
      "Create a token at readwise.io/access_token and paste it here. That is the whole setup.",
    tokenStorageSecret:
      " It is stored in Obsidian's device-local secret storage, so it never enters your synced vault — enter it once per device.",
    tokenStorageFallback:
      " This Obsidian version has no secret storage, so the token is kept in the plugin's data file inside your vault. If that vault syncs, the token syncs with it.",
    tokenScopeWarning:
      "A Readwise token grants full access to your whole Readwise and Reader account. This plugin only ever saves documents — it never deletes anything.",

    connectionName: "Connection",
    connectionDesc: "Check that Readwise accepts the token.",
    testConnection: "Test",
    testing: "Testing…",
    setTokenFirst: "Add an access token first.",

    locationName: "Save documents to",
    locationDesc:
      "Where documents saved from a note are filed in Reader. Reader's Shortlist cannot be set through the API.",
    locationNew: "New",
    locationLater: "Later",
    locationArchive: "Archive",
    locationFeed: "Feed",

    tagsName: "Tags for saved documents",
    tagsDesc: "Comma-separated; applied to every document this plugin saves.",
    tagsPlaceholder: "obsidian, reading",

    colorHeading: "Highlight colours",
    colorDesc:
      "Readwise does not expose highlight colours, so colour comes from tags. The first matching rule wins, so order matters — a highlight's own tags are checked before its source's.",
    colorTagPlaceholder: "tag",
    colorColorPlaceholder: "#3b82f6",
    colorCalloutPlaceholder: "callout",
    colorNoteTagPlaceholder: "note tag (optional)",
    colorMoveUp: "Move up",
    colorMoveDown: "Move down",
    colorRemove: "Remove rule",
    addColorRule: "Add rule",
    add: "Add",
    defaultColorName: "Default colour",
    defaultColorDesc: "Used for any highlight that matches no rule.",

    indexName: "Index my whole library",
    indexDesc:
      "Off by default. Highlights already bring every source you have highlighted. Turn this on to also link documents you have saved but not highlighted — it costs one request per 100 documents.",
    indexedLocationsName: "Locations to index",
    indexedLocationsDesc:
      "Only used when indexing the whole library. Feed is excluded by default because it is usually the largest.",
  },
};

export type Messages = typeof en;
