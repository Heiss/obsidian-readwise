import { SuggestModal } from "obsidian";
import type ReadwisePlugin from "../main";
import { searchDocuments, type IndexedDoc } from "../core/index";
import { t } from "../i18n";

/**
 * Search the local index and resolve to a single document (F1).
 *
 * Reader has no search endpoint, so this queries the plugin's own index rather
 * than the network — which also makes it instant and usable offline. An empty
 * query lists the most recently updated documents, so a source can be picked
 * without typing.
 */
export class DocumentPicker extends SuggestModal<IndexedDoc> {
  constructor(
    private readonly plugin: ReadwisePlugin,
    private readonly onResolved: (doc: IndexedDoc) => void,
    placeholder = t().picker.searchPlaceholder,
  ) {
    super(plugin.app);
    this.setPlaceholder(placeholder);
  }

  getSuggestions(query: string): IndexedDoc[] {
    return searchDocuments(this.plugin.index, query, 25);
  }

  renderSuggestion(doc: IndexedDoc, el: HTMLElement): void {
    el.createDiv({ text: doc.title || doc.sourceUrl || doc.id });

    const parts: string[] = [];
    if (doc.author) parts.push(doc.author);
    if (doc.siteName) parts.push(doc.siteName);
    else if (doc.sourceUrl) parts.push(doc.sourceUrl);
    const highlights = this.plugin.index.highlightsByDoc[doc.id]?.length ?? 0;
    if (highlights > 0) parts.push(t().picker.highlightCount(highlights));
    if (doc.tags.length > 0) parts.push(doc.tags.map((tag) => `#${tag}`).join(" "));

    el.createEl("small", { text: parts.join("  ·  "), cls: "rw-suggest-sub" });
  }

  onNoSuggestion(): void {
    this.resultContainerEl.empty();
    this.resultContainerEl.createDiv({
      cls: "rw-suggest-empty",
      text:
        this.plugin.index.highlightsSyncedAt === undefined
          ? t().picker.emptyNotSynced
          : t().picker.emptyNoMatch,
    });
  }

  onChooseSuggestion(doc: IndexedDoc): void {
    this.onResolved(doc);
  }
}
