import {
  Editor,
  ItemView,
  MarkdownView,
  Notice,
  TFile,
  WorkspaceLeaf,
  debounce,
  setIcon,
} from "obsidian";
import type ReadwisePlugin from "../main";
import { extractBindings, type Binding } from "../core/links";
import { highlightsFor, type IndexedHighlight } from "../core/index";
import { resolveColor } from "../core/colorRules";
import {
  blockId,
  blockSeparatorAfter,
  blockSeparatorBefore,
  formatQuote,
  hasBlockId,
} from "../core/quote";
import { t } from "../i18n";

export const VIEW_TYPE_PANEL = "readwise-reader-panel";

interface SourceGroup {
  binding: Binding;
  title: string;
  highlights: IndexedHighlight[];
  bookTags: string[];
  /** Set when this source cannot show highlights, and why. */
  note?: string;
}

/**
 * The highlight panel (F2): a right-sidebar view that tracks the active note,
 * finds its Reader bindings and lists each source's highlights.
 *
 * It reads from the local index rather than the network, so it is instant and
 * works offline; refreshing means running a delta sync, not fetching one source.
 */
export class HighlightPanel extends ItemView {
  private groups: SourceGroup[] = [];
  private currentFile: TFile | null = null;

  private readonly onActiveChange = debounce(() => void this.refresh(), 300, true);

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ReadwisePlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PANEL;
  }

  getDisplayText(): string {
    return t().panel.displayText;
  }

  getIcon(): string {
    return "highlighter";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", this.onActiveChange),
    );
    this.registerEvent(this.app.workspace.on("file-open", this.onActiveChange));
    await this.refresh();
  }

  async onClose(): Promise<void> {
    // Nothing to release.
  }

  /** Rescan the active note and re-read the index. */
  async refresh(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    this.currentFile = file;
    this.groups = [];

    if (!file || file.extension !== "md") {
      this.renderMessage(t().panel.openNoteToSee);
      return;
    }

    const body = await this.app.vault.cachedRead(file);
    const bindings = extractBindings(body);
    if (bindings.length === 0) {
      this.renderMessage(t().panel.noLinksInNote);
      return;
    }

    this.groups = bindings.map((binding) => this.groupFor(binding));
    this.render();
  }

  private groupFor(binding: Binding): SourceGroup {
    const doc = this.plugin.index.docs[binding.id];
    const title = doc?.title || binding.text?.trim() || binding.url;
    const lookup = highlightsFor(this.plugin.index, binding.id);

    switch (lookup.state) {
      case "not-synced":
        // Before a sync we do not know that a source has no highlights — we
        // just have not looked. Saying "none" here would be a quiet lie.
        return { binding, title, highlights: [], bookTags: [], note: t().panel.notSyncedYet };
      case "unknown-document":
        // A Reader link that is not in this account's library: copied from
        // someone else, or saved on another account.
        return {
          binding,
          title,
          highlights: [],
          bookTags: [],
          note: t().panel.unknownDocument,
        };
      default:
        return {
          binding,
          title,
          highlights: lookup.highlights,
          bookTags: lookup.bookTags,
          note: undefined,
        };
    }
  }

  private renderMessage(text: string): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("rw-panel");
    this.renderHeader(container);
    container.createDiv({ cls: "rw-panel-empty", text });
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: "nav-header" });
    const buttons = header.createDiv({ cls: "nav-buttons-container" });

    const action = (icon: string, label: string, onClick: () => void): void => {
      const btn = buttons.createDiv({
        cls: "clickable-icon nav-action-button",
        attr: { "aria-label": label },
      });
      setIcon(btn, icon);
      btn.onclick = onClick;
    };

    action("refresh-cw", t().panel.actions.refresh, () => {
      void this.plugin.syncNow();
    });
    action("search", t().panel.actions.link, () =>
      this.withEditor((editor) => this.plugin.openPicker(editor)),
    );
  }

  /** Run an action against the current note's editor, or warn if none is open. */
  private withEditor(fn: (editor: Editor) => void): void {
    const view = this.markdownViewForCurrentFile();
    if (!view) {
      new Notice(t().panel.openInPaneFirst);
      return;
    }
    fn(view.editor);
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("rw-panel");
    this.renderHeader(container);

    for (const group of this.groups) {
      const section = container.createDiv({ cls: "rw-source" });
      const titleEl = section.createDiv({ cls: "rw-source-title" });
      const anchor = titleEl.createEl("a", {
        text: group.title,
        href: group.binding.url,
      });
      anchor.setAttr("target", "_blank");

      if (group.note) {
        section.createDiv({ cls: "rw-panel-empty", text: group.note });
        continue;
      }
      if (group.highlights.length === 0) {
        section.createDiv({ cls: "rw-panel-empty", text: t().panel.noHighlightsYet });
        continue;
      }
      for (const highlight of group.highlights) {
        this.renderHighlight(section, group, highlight);
      }
    }
  }

  private renderHighlight(
    parent: HTMLElement,
    group: SourceGroup,
    highlight: IndexedHighlight,
  ): void {
    const resolved = resolveColor(
      this.plugin.settings.colorRules,
      highlight.tags,
      group.bookTags,
      this.plugin.settings.defaultColor,
    );

    const row = parent.createDiv({ cls: "rw-highlight" });
    const bar = row.createDiv({ cls: "rw-color-bar" });
    bar.style.setProperty("--rw-highlight-color", resolved.color);

    const body = row.createDiv({ cls: "rw-highlight-body" });
    body.createDiv({ cls: "rw-highlight-text", text: highlight.text });
    if (highlight.note) {
      body.createDiv({ cls: "rw-highlight-note", text: highlight.note });
    }
    if (highlight.tags.length > 0) {
      body.createDiv({
        cls: "rw-highlight-tags",
        text: highlight.tags.map((tag) => `#${tag}`).join(" "),
      });
    }

    const actions = body.createDiv({ cls: "rw-highlight-actions" });
    const insert = actions.createEl("button", {
      cls: "rw-highlight-insert",
      text: t().panel.insertAsQuote,
    });
    insert.onclick = () => this.insertQuote(group, highlight);
  }

  /** The open Markdown view showing the note this panel is bound to, if any. */
  private markdownViewForCurrentFile(): MarkdownView | null {
    if (!this.currentFile) return null;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file === this.currentFile) {
        return view;
      }
    }
    return null;
  }

  /** F4 — materialize a highlight as a callout at the cursor, with dedupe. */
  private insertQuote(group: SourceGroup, highlight: IndexedHighlight): void {
    // Clicking the panel makes it the active view, so the active Markdown view
    // is not the note — find the editor by file instead.
    const view = this.markdownViewForCurrentFile();
    if (!view) {
      new Notice(t().panel.openInPaneToInsert);
      return;
    }
    const editor = view.editor;
    if (hasBlockId(editor.getValue(), highlight.id)) {
      new Notice(t().panel.alreadyInserted(blockId(highlight.id)));
      return;
    }

    const quote = formatQuote(highlight, {
      rules: this.plugin.settings.colorRules,
      defaultColor: this.plugin.settings.defaultColor,
      bookTags: group.bookTags,
      sourceHref: group.binding.url,
      sourceLabel: group.title,
    });

    const value = editor.getValue();

    // In reading mode there is no live cursor, so append at the end.
    if (view.getMode() === "preview") {
      const last = editor.lastLine();
      const end = { line: last, ch: editor.getLine(last).length };
      editor.replaceRange(`${blockSeparatorBefore(value)}${quote}\n`, end);
    } else {
      const from = editor.posToOffset(editor.getCursor("from"));
      const to = editor.posToOffset(editor.getCursor("to"));
      const prefix = blockSeparatorBefore(value.slice(0, from));
      const suffix = blockSeparatorAfter(value.slice(to));
      editor.replaceSelection(`${prefix}${quote}${suffix}`);
    }
    new Notice(t().panel.inserted(blockId(highlight.id)));
  }
}
