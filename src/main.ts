import { Editor, Notice, Plugin, WorkspaceLeaf, getLanguage } from "obsidian";
import { ReadwiseClient } from "./api/client";
import type { ReaderTag } from "./api/models";
import { emptyIndex, type IndexData } from "./core/index";
import { buildDeepLink } from "./core/urls";
import { formatBindingLink, documentLabel } from "./core/binding";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type ReadwiseSettings,
} from "./settings";
import { obsidianHttp } from "./obsidian/httpAdapter";
import { createTokenStore, type TokenStore } from "./obsidian/tokenStore";
import { IndexStore } from "./obsidian/indexStore";
import { ReadwiseSettingTab } from "./ui/settingsTab";
import { HighlightPanel, VIEW_TYPE_PANEL } from "./ui/panel";
import { DocumentPicker } from "./ui/picker";
import { SyncController } from "./ui/syncController";
import { initI18n, t } from "./i18n";

/**
 * What lives in `data.json`. Deliberately settings-only: the index gets its own
 * file (see `IndexStore`), because `data.json` is parsed synchronously on load,
 * rewritten whole on every save, and syncs with the vault.
 */
interface PersistedData {
  settings?: Partial<ReadwiseSettings>;
}

export default class ReadwisePlugin extends Plugin {
  settings: ReadwiseSettings = { ...DEFAULT_SETTINGS };
  index: IndexData = emptyIndex();
  tokenStore!: TokenStore;
  indexStore!: IndexStore;
  sync!: SyncController;
  /** Reader tags, fetched on demand to populate settings pickers. */
  tags: ReaderTag[] = [];

  async onload(): Promise<void> {
    initI18n(getLanguage());

    const data = (await this.loadData()) as PersistedData | null;
    this.settings = mergeSettings(data?.settings);

    this.tokenStore = createTokenStore(
      this.app,
      () => this.settings.tokenSecretId,
      {
        get: () => this.settings.tokenFallback,
        set: (v) => {
          this.settings.tokenFallback = v;
          void this.saveData(this.serialize());
        },
      },
    );

    this.indexStore = new IndexStore(
      this.app,
      `${this.app.vault.configDir}/plugins/${this.manifest.id}`,
    );
    this.index = await this.indexStore.load();

    this.sync = new SyncController({
      index: this.index,
      getClient: () => this.getClient(),
      persistIndex: () => this.indexStore.flush(this.index),
      onIndexChanged: () => this.refreshPanel(),
    });

    this.registerView(VIEW_TYPE_PANEL, (leaf) => new HighlightPanel(leaf, this));

    this.addRibbonIcon("highlighter", t().plugin.ribbonTooltip, () => {
      void this.activatePanel();
    });

    this.addCommand({
      id: "open-panel",
      name: t().plugin.commands.openPanel,
      callback: () => void this.activatePanel(),
    });

    this.addCommand({
      id: "link-source",
      name: t().plugin.commands.picker,
      editorCallback: (editor) => this.openPicker(editor),
    });

    this.addCommand({
      id: "sync-now",
      name: t().plugin.commands.syncNow,
      callback: () => void this.syncNow(),
    });

    this.addSettingTab(new ReadwiseSettingTab(this.app, this));

    // A delta sync on load is one or two requests once the index exists, so it
    // is quiet. The first sync is the expensive one and is triggered
    // deliberately from settings, not silently on install.
    this.app.workspace.onLayoutReady(() => {
      if (this.index.highlightsSyncedAt !== undefined) {
        void this.sync.run(this.syncOptions(), false);
      }
    });
  }

  onunload(): void {
    // Obsidian does not await onunload, so this is a best-effort final write.
    // Losing it costs a re-sync at worst: the index is derived state.
    void this.indexStore.flush(this.index);
  }

  serialize(): PersistedData {
    return { settings: this.settings };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.serialize());
    this.refreshPanel();
  }

  /** Sync options derived from the current settings. */
  syncOptions(): { includeDocuments: boolean; locations: ReadwiseSettings["indexedLocations"] } {
    return {
      includeDocuments: this.settings.indexAllDocuments,
      locations: this.settings.indexedLocations,
    };
  }

  /** Run a visible sync; the panel's refresh button and the command use this. */
  async syncNow(full = false): Promise<void> {
    if (!this.getClient()) return this.warnNotConfigured();
    await this.sync.run({ ...this.syncOptions(), full });
  }

  /** Throw the index away and pull everything again — the deletion backstop. */
  async rebuildIndex(): Promise<void> {
    if (!this.getClient()) return this.warnNotConfigured();
    await this.indexStore.clear();
    // Mutate in place: the sync controller holds a reference to this object.
    Object.assign(this.index, emptyIndex());
    await this.syncNow(true);
  }

  /**
   * Build an API client, or null when no token is configured. Unlike the
   * Linkwarden plugin there is no base URL to check: Readwise is one hosted
   * service, which is what makes the token the entire setup.
   */
  getClient(): ReadwiseClient | null {
    const token = this.tokenStore.get();
    if (!token) return null;
    return new ReadwiseClient(obsidianHttp, {
      token,
      apiBase: this.settings.apiBase,
    });
  }

  /** Fetch the account's Reader tags, for the settings pickers. */
  async fetchTags(): Promise<ReaderTag[] | null> {
    const client = this.getClient();
    if (!client) return null;
    this.tags = await client.listTags();
    return this.tags;
  }

  warnNotConfigured(): void {
    new Notice(t().plugin.notConfigured);
  }

  /** F1 — pick a source from the index and insert a binding at the cursor. */
  openPicker(editor: Editor): void {
    if (!this.getClient()) return this.warnNotConfigured();
    new DocumentPicker(this, (doc) => {
      editor.replaceSelection(
        formatBindingLink(documentLabel(doc), buildDeepLink(doc.id)),
      );
      new Notice(t().picker.linked(documentLabel(doc)));
    }).open();
  }

  /** Re-render the panel after the index or settings changed. */
  refreshPanel(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PANEL)) {
      const view = leaf.view;
      if (view instanceof HighlightPanel) void view.refresh();
    }
  }

  async activatePanel(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null =
      workspace.getLeavesOfType(VIEW_TYPE_PANEL)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: VIEW_TYPE_PANEL, active: true });
    }
    if (leaf) await workspace.revealLeaf(leaf);
  }
}
