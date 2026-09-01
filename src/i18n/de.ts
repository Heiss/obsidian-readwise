// Deutsche Übersetzung. Struktur identisch zu `en.ts` — ein Test prüft das.

import type { Messages } from "./en";

export const de: Messages = {
  plugin: {
    notConfigured:
      "Readwise Reader: Bitte zuerst den Zugriffstoken in den Plugin-Einstellungen eintragen.",
    ribbonTooltip: "Readwise-Markierungen",
    commands: {
      openPanel: "Markierungs-Panel \u00f6ffnen",
      picker: "Quelle verkn\u00fcpfen (Suche)",
      syncNow: "Jetzt synchronisieren",
    },
  },
  panel: {
    displayText: "Readwise-Markierungen",
    openNoteToSee: "\u00d6ffne eine Notiz, um ihre Readwise-Markierungen zu sehen.",
    noLinksInNote:
      "Keine Readwise-Links in dieser Notiz. \u00dcber \u201eQuelle verkn\u00fcpfen\u201c einen hinzuf\u00fcgen.",
    noHighlightsYet: "F\u00fcr diese Quelle gibt es in Readwise noch keine Markierungen.",
    notSyncedYet: "Noch nicht synchronisiert \u2014 Synchronisierung starten, um Markierungen zu laden.",
    unknownDocument:
      "Dieses Dokument ist nicht in deiner Readwise-Bibliothek. Es geh\u00f6rt m\u00f6glicherweise zu einem anderen Konto.",
    openInPaneFirst: "\u00d6ffne die Notiz zuerst in einem Bereich.",
    openInPaneToInsert: "\u00d6ffne die Notiz in einem Bereich, um das Zitat einzuf\u00fcgen.",
    insertAsQuote: "Als Zitat einf\u00fcgen",
    inserted: (id: string) => `Als ^${id} eingef\u00fcgt.`,
    alreadyInserted: (id: string) => `Bereits als ^${id} in dieser Notiz.`,
    actions: {
      refresh: "Jetzt synchronisieren",
      link: "Quelle verkn\u00fcpfen",
    },
  },
  picker: {
    searchPlaceholder: "Readwise-Bibliothek durchsuchen\u2026",
    highlightCount: (n: number) => (n === 1 ? "1 Markierung" : `${n} Markierungen`),
    emptyNotSynced:
      "Noch nichts indiziert \u2014 Synchronisierung in den Einstellungen oder im Panel starten.",
    emptyNoMatch: "Kein passendes Dokument.",
    linked: (title: string) => `Mit ${title} verkn\u00fcpft.`,
  },
  settings: {
    tokenName: "Zugriffstoken",
    tokenIntro:
      "Token auf readwise.io/access_token erzeugen und hier einfügen. Mehr ist nicht einzurichten.",
    tokenStorageSecret:
      " Er wird im gerätelokalen Schlüsselspeicher von Obsidian abgelegt und landet damit nie im synchronisierten Tresor — einmal pro Gerät eintragen.",
    tokenStorageFallback:
      " Diese Obsidian-Version hat keinen Schlüsselspeicher, der Token liegt deshalb in der Datendatei des Plugins im Tresor. Wird der Tresor synchronisiert, wird der Token mitsynchronisiert.",
    tokenScopeWarning:
      "Ein Readwise-Token gewährt vollen Zugriff auf das gesamte Readwise- und Reader-Konto. Dieses Plugin speichert ausschließlich Dokumente — es löscht nichts.",

    connectionName: "Verbindung",
    connectionDesc: "Prüfen, ob Readwise den Token akzeptiert.",
    testConnection: "Testen",
    testing: "Teste…",
    setTokenFirst: "Bitte zuerst einen Zugriffstoken eintragen.",

    locationName: "Dokumente speichern unter",
    locationDesc:
      "Wohin aus einer Notiz gespeicherte Dokumente in Reader einsortiert werden. Die Shortlist lässt sich über die API nicht setzen.",
    locationNew: "Neu",
    locationLater: "Später",
    locationArchive: "Archiv",
    locationFeed: "Feed",

    tagsName: "Tags für gespeicherte Dokumente",
    tagsDesc:
      "Komma-getrennt; werden auf jedes von diesem Plugin gespeicherte Dokument angewendet.",
    tagsPlaceholder: "obsidian, lesen",

    colorHeading: "Farben für Markierungen",
    colorDesc:
      "Readwise liefert keine Farben für Markierungen, deshalb kommt die Farbe aus Tags. Die erste passende Regel gewinnt, die Reihenfolge zählt also — die Tags der Markierung selbst werden vor denen der Quelle geprüft.",
    colorTagPlaceholder: "Tag",
    colorColorPlaceholder: "#3b82f6",
    colorCalloutPlaceholder: "Callout",
    colorNoteTagPlaceholder: "Notiz-Tag (optional)",
    colorMoveUp: "Nach oben",
    colorMoveDown: "Nach unten",
    colorRemove: "Regel entfernen",
    addColorRule: "Regel hinzufügen",
    add: "Hinzufügen",
    defaultColorName: "Standardfarbe",
    defaultColorDesc: "Für jede Markierung, auf die keine Regel passt.",

    indexName: "Gesamte Bibliothek indizieren",
    indexDesc:
      "Standardmäßig aus. Die Markierungen bringen bereits jede markierte Quelle mit. Einschalten, um auch Dokumente zu verlinken, die gespeichert, aber nicht markiert wurden — kostet eine Anfrage je 100 Dokumente.",
    syncHeading: "Synchronisierung",
    syncNow: "Jetzt synchronisieren",
    syncNowDesc:
      "Holt alles, was seit der letzten Synchronisierung neu ist. Die erste Synchronisierung lädt die gesamte Markierungs-Historie.",
    syncRunning: "Synchronisiere…",
    syncCancel: "Abbrechen",
    rebuild: "Index neu aufbauen",
    rebuildDesc:
      "Verwirft die lokale Kopie und lädt alles erneut. Nötig, um in Readwise gelöschte Markierungen zu bemerken — die API meldet Löschungen nicht.",
    neverSynced: "Noch nie synchronisiert.",
    syncStatus: (documents: number, highlights: number, sources: number) =>
      `${documents} Dokumente, ${highlights} Markierungen aus ${sources} Quellen.`,
    unjoinedNote: (n: number) =>
      `${n} markierte Quellen sind keine Reader-Dokumente (Kindle, Podcasts) und lassen sich nicht verknüpfen.`,
    indexedLocationsName: "Zu indizierende Bereiche",
    indexedLocationsDesc:
      "Nur relevant, wenn die gesamte Bibliothek indiziert wird. Feed ist standardmäßig ausgenommen, weil er meist der größte Bereich ist.",
  },
};
