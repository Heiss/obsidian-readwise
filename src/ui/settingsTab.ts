import {
  App,
  Notice,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
  type SettingGroupItem,
} from "obsidian";
import type ReadwisePlugin from "../main";
import { asTokenValue } from "../core/secretId";
import { mountSecretName } from "../obsidian/secretComponent";
import type { WritableLocation } from "../api/models";
import { t } from "../i18n";

// Declarative settings only (Obsidian >= 1.13). The Linkwarden plugin this is
// ported from carries a second, imperative implementation because it shipped
// with an older `minAppVersion` and has installed users; a new plugin has
// neither, so `minAppVersion` is 1.13 and that whole compatibility layer — and
// its dual-path drift risk — simply does not exist here.
export class ReadwiseSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ReadwisePlugin,
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const s = t().settings;
    return [
      {
        name: s.tokenName,
        desc: s.tokenIntro,
        render: (setting) => this.renderTokenSetting(setting),
      },
      {
        name: s.connectionName,
        desc: s.connectionDesc,
        render: (setting) => this.renderConnectionTest(setting),
      },
      {
        name: s.locationName,
        desc: s.locationDesc,
        control: {
          type: "dropdown",
          key: "defaultLocation",
          options: {
            new: s.locationNew,
            later: s.locationLater,
            archive: s.locationArchive,
            feed: s.locationFeed,
          },
        },
      },
      {
        name: s.tagsName,
        desc: s.tagsDesc,
        control: {
          type: "text",
          key: "defaultTags",
          placeholder: s.tagsPlaceholder,
        },
      },
      {
        type: "group",
        heading: s.colorHeading,
        items: [
          {
            name: s.colorHeading,
            searchable: false,
            render: (setting) => {
              setting.setName("").setDesc(s.colorDesc);
            },
          },
          ...this.plugin.settings.colorRules.map(
            (rule, i): SettingGroupItem => ({
              name: rule.tag,
              render: (setting: Setting) => this.renderColorRule(setting, i),
            }),
          ),
          {
            name: s.addColorRule,
            searchable: false,
            render: (setting: Setting) => this.renderAddColorRule(setting),
          },
          {
            name: s.defaultColorName,
            desc: s.defaultColorDesc,
            render: (setting: Setting) => this.renderDefaultColor(setting),
          },
        ],
      },
      {
        name: s.indexName,
        desc: s.indexDesc,
        control: { type: "toggle", key: "indexAllDocuments" },
      },
    ];
  }

  /** Read the value backing a declarative `control`. */
  getControlValue(key: string): unknown {
    const s = this.plugin.settings;
    switch (key) {
      case "defaultLocation":
        return s.defaultLocation;
      case "defaultTags":
        return s.defaultTags.join(", ");
      case "indexAllDocuments":
        return s.indexAllDocuments;
      default:
        return undefined;
    }
  }

  /** Persist a declarative `control` change into `plugin.settings`. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.plugin.settings;
    switch (key) {
      case "defaultLocation":
        s.defaultLocation = value as WritableLocation;
        break;
      case "defaultTags":
        s.defaultTags = String(value)
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag !== "");
        break;
      case "indexAllDocuments":
        s.indexAllDocuments = Boolean(value);
        break;
      default:
        return;
    }
    await this.plugin.saveSettings();
  }

  private renderTokenSetting(setting: Setting): void {
    const m = t().settings;
    const store = this.plugin.tokenStore;
    const s = this.plugin.settings;

    setting.setName(m.tokenName);

    const desc = new DocumentFragment();
    desc.append(
      m.tokenIntro,
      store.hasSecretStorage() ? m.tokenStorageSecret : m.tokenStorageFallback,
    );
    // The token is unscoped: it can read and write the user's whole Readwise
    // account. Saying so is part of the deal, not a footnote.
    desc.createDiv({ text: m.tokenScopeWarning, cls: "rw-token-scope" });
    setting.setDesc(desc);

    if (store.hasSecretStorage()) {
      // SecretComponent owns the secret *value*; we persist only its *name* and
      // resolve the value at runtime. Do NOT treat the component's value as the
      // raw token — its setValue/onChange deal in the name.
      setting.addComponent((el) =>
        mountSecretName(this.app, el, s.tokenSecretId, (name) => {
          s.tokenSecretId = name;
          store.setFallback(asTokenValue("")); // no stale plaintext copy
          void this.plugin.saveSettings();
        }),
      );
      return;
    }

    setting.addText((text) => {
      text.inputEl.type = "password";
      text
        .setPlaceholder(m.tokenName)
        .setValue(store.get())
        .onChange((v) => {
          // Boundary: the user typed the raw token value.
          store.setFallback(asTokenValue(v.trim()));
        });
    });
  }

  private renderConnectionTest(setting: Setting): void {
    const m = t().settings;
    let statusEl!: HTMLElement;
    setting
      .setName(m.connectionName)
      .setDesc(m.connectionDesc)
      .addButton((b) =>
        b.setButtonText(m.testConnection).onClick(async () => {
          const client = this.plugin.getClient();
          if (!client) {
            this.setConnStatus(statusEl, false, m.setTokenFirst);
            return;
          }
          b.setDisabled(true).setButtonText(m.testing);
          this.setConnStatus(statusEl, null, m.testing);
          const result = await client.checkConnection();
          b.setDisabled(false).setButtonText(m.testConnection);
          this.setConnStatus(statusEl, result.ok, result.message);
        }),
      );
    statusEl = setting.descEl.createDiv({ cls: "rw-conn-status" });
  }

  /** Update the inline connection-test result line. `ok === null` = in progress. */
  private setConnStatus(
    el: HTMLElement,
    ok: boolean | null,
    message: string,
  ): void {
    el.setText(message);
    el.toggleClass("is-ok", ok === true);
    el.toggleClass("is-error", ok === false);
  }

  /**
   * One colour rule. Rules are ordered and first-match-wins, so the reorder
   * buttons are not a convenience — without them the user cannot express which
   * of two matching tags should win.
   */
  private renderColorRule(setting: Setting, index: number): void {
    const m = t().settings;
    const rules = this.plugin.settings.colorRules;
    const rule = rules[index];

    setting
      .setName(`${index + 1}.`)
      .addText((text) =>
        text
          .setPlaceholder(m.colorTagPlaceholder)
          .setValue(rule.tag)
          .onChange(async (v) => {
            rule.tag = v.trim();
            await this.plugin.saveSettings();
          }),
      )
      .addColorPicker((picker) =>
        picker.setValue(rule.color).onChange(async (v) => {
          rule.color = v;
          await this.plugin.saveSettings();
        }),
      )
      .addText((text) =>
        text
          .setPlaceholder(m.colorCalloutPlaceholder)
          .setValue(rule.callout)
          .onChange(async (v) => {
            rule.callout = v.trim() || "quote";
            await this.plugin.saveSettings();
          }),
      )
      .addText((text) =>
        text
          .setPlaceholder(m.colorNoteTagPlaceholder)
          .setValue(rule.noteTag ?? "")
          .onChange(async (v) => {
            const tag = v.trim().replace(/^#/, "");
            if (tag) rule.noteTag = tag;
            else delete rule.noteTag;
            await this.plugin.saveSettings();
          }),
      )
      .addExtraButton((b) =>
        b
          .setIcon("chevron-up")
          .setTooltip(m.colorMoveUp)
          .setDisabled(index === 0)
          .onClick(() => void this.moveRule(index, -1)),
      )
      .addExtraButton((b) =>
        b
          .setIcon("chevron-down")
          .setTooltip(m.colorMoveDown)
          .setDisabled(index === rules.length - 1)
          .onClick(() => void this.moveRule(index, 1)),
      )
      .addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip(m.colorRemove)
          .onClick(async () => {
            rules.splice(index, 1);
            await this.plugin.saveSettings();
            this.update();
          }),
      );
  }

  private async moveRule(index: number, delta: number): Promise<void> {
    const rules = this.plugin.settings.colorRules;
    const target = index + delta;
    if (target < 0 || target >= rules.length) return;
    [rules[index], rules[target]] = [rules[target], rules[index]];
    await this.plugin.saveSettings();
    this.update();
  }

  private renderAddColorRule(setting: Setting): void {
    const m = t().settings;
    let newTag = "";
    setting
      .setName(m.addColorRule)
      .addText((text) =>
        text.setPlaceholder(m.colorTagPlaceholder).onChange((v) => {
          newTag = v.trim();
        }),
      )
      .addButton((b) =>
        b
          .setButtonText(m.add)
          .setCta()
          .onClick(async () => {
            if (!newTag) return;
            this.plugin.settings.colorRules.push({
              tag: newTag,
              color: this.plugin.settings.defaultColor.color,
              callout: "quote",
            });
            await this.plugin.saveSettings();
            this.update();
          }),
      );
  }

  private renderDefaultColor(setting: Setting): void {
    const m = t().settings;
    const fallback = this.plugin.settings.defaultColor;
    setting
      .setName(m.defaultColorName)
      .setDesc(m.defaultColorDesc)
      .addColorPicker((picker) =>
        picker.setValue(fallback.color).onChange(async (v) => {
          fallback.color = v;
          await this.plugin.saveSettings();
        }),
      )
      .addText((text) =>
        text
          .setPlaceholder(m.colorCalloutPlaceholder)
          .setValue(fallback.callout)
          .onChange(async (v) => {
            fallback.callout = v.trim() || "quote";
            await this.plugin.saveSettings();
          }),
      );
  }
}

/** Shown when an action needs a token and none is configured. */
export function warnNotConfigured(): void {
  new Notice(t().plugin.notConfigured);
}
