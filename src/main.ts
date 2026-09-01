import { Plugin, getLanguage } from "obsidian";
import { ReadwiseClient } from "./api/client";
import type { ReaderTag } from "./api/models";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type ReadwiseSettings,
} from "./settings";
import { obsidianHttp } from "./obsidian/httpAdapter";
import { createTokenStore, type TokenStore } from "./obsidian/tokenStore";
import { ReadwiseSettingTab } from "./ui/settingsTab";
import { initI18n } from "./i18n";

/**
 * What lives in `data.json`. Deliberately settings-only: the highlight/document
 * index gets its own file, because `data.json` is parsed synchronously on load
 * and rewritten whole on every save, and it syncs with the vault.
 */
interface PersistedData {
  settings?: Partial<ReadwiseSettings>;
}

export default class ReadwisePlugin extends Plugin {
  settings: ReadwiseSettings = { ...DEFAULT_SETTINGS };
  tokenStore!: TokenStore;
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

    this.addSettingTab(new ReadwiseSettingTab(this.app, this));
  }

  serialize(): PersistedData {
    return { settings: this.settings };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.serialize());
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

  /**
   * Fetch the account's Reader tags and cache them on the plugin, for the
   * settings pickers. Returns null when no client is configured.
   */
  async fetchTags(): Promise<ReaderTag[] | null> {
    const client = this.getClient();
    if (!client) return null;
    this.tags = await client.listTags();
    return this.tags;
  }
}
