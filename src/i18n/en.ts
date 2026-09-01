// English string table — the source of truth. `de.ts` mirrors its shape, and a
// unit test asserts the two never drift apart.

export const en = {
  plugin: {
    notConfigured:
      "Readwise Reader: add your access token in the plugin settings first.",
    ribbonTooltip: "Readwise highlights",
    commands: {
      openPanel: "Open highlight panel",
      picker: "Link a source (search)",
      syncNow: "Sync now",
    },
  },
  panel: {
    displayText: "Readwise highlights",
    openNoteToSee: "Open a note to see its Readwise highlights.",
    noLinksInNote: "No Readwise links in this note. Use \u201cLink a source\u201d to add one.",
    noHighlightsYet: "No highlights in Readwise for this source yet.",
    notSyncedYet: "Not synced yet \u2014 run a sync to load highlights.",
    unknownDocument:
      "This document is not in your Readwise library. It may belong to someone else\u2019s account.",
    openInPaneFirst: "Open the note in a pane first.",
    openInPaneToInsert: "Open the note in a pane to insert the quote.",
    insertAsQuote: "Insert as quote",
    inserted: (id: string) => `Inserted as ^${id}.`,
    alreadyInserted: (id: string) => `Already in this note as ^${id}.`,
    actions: {
      refresh: "Sync now",
      link: "Link a source",
    },
  },
  picker: {
    searchPlaceholder: "Search your Readwise library\u2026",
    highlightCount: (n: number) => (n === 1 ? "1 highlight" : `${n} highlights`),
    emptyNotSynced: "Nothing indexed yet \u2014 run a sync from the settings or the panel.",
    emptyNoMatch: "No matching document.",
    linked: (title: string) => `Linked to ${title}.`,
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
    syncHeading: "Sync",
    syncNow: "Sync now",
    syncNowDesc:
      "Fetches everything new since the last sync. The first sync pulls your whole highlight history.",
    syncRunning: "Syncing…",
    syncCancel: "Cancel",
    rebuild: "Rebuild index",
    rebuildDesc:
      "Throws the local copy away and pulls everything again. Needed to notice highlights deleted in Readwise, which the API does not report.",
    neverSynced: "Never synced.",
    syncStatus: (documents: number, highlights: number, sources: number) =>
      `${documents} documents, ${highlights} highlights from ${sources} sources.`,
    unjoinedNote: (n: number) =>
      `${n} highlighted sources are not Reader documents (Kindle, podcasts) and cannot be linked.`,
    indexedLocationsName: "Locations to index",
    indexedLocationsDesc:
      "Only used when indexing the whole library. Feed is excluded by default because it is usually the largest.",
  },
};

export type Messages = typeof en;
