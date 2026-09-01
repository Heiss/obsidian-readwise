// Deutsche Übersetzung. Struktur identisch zu `en.ts` — ein Test prüft das.

import type { Messages } from "./en";

export const de: Messages = {
  plugin: {
    notConfigured:
      "Readwise Reader: Bitte zuerst den Zugriffstoken in den Plugin-Einstellungen eintragen.",
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
    indexedLocationsName: "Zu indizierende Bereiche",
    indexedLocationsDesc:
      "Nur relevant, wenn die gesamte Bibliothek indiziert wird. Feed ist standardmäßig ausgenommen, weil er meist der größte Bereich ist.",
  },
};
