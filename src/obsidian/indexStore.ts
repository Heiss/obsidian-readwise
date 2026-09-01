// Where the index lives on disk.
//
// NOT in `data.json`. That file is parsed synchronously when the plugin loads,
// rewritten in full on every settings save, and sits inside the vault — so it
// syncs. A library-sized blob there is a startup stall, a write amplifier and a
// generator of sync-conflict files. The index gets its own file in the plugin
// folder instead, written debounced.
//
// Losing this file costs nothing but a re-sync: the index holds no user-authored
// data. Every failure path here therefore degrades to "empty index" rather than
// throwing.

import type { App } from "obsidian";
import { emptyIndex, reviveIndex, type IndexData } from "../core/index";

const INDEX_FILE = "index.json";

/** Coalesce bursts of writes (a sync merges a page at a time). */
const WRITE_DEBOUNCE_MS = 1500;

export class IndexStore {
  private pending: number | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly app: App,
    /** The plugin's config directory, e.g. `.obsidian/plugins/readwise-reader`. */
    private readonly dir: string,
  ) {}

  private get path(): string {
    return `${this.dir}/${INDEX_FILE}`;
  }

  async load(): Promise<IndexData> {
    try {
      const adapter = this.app.vault.adapter;
      if (!(await adapter.exists(this.path))) return emptyIndex();
      return reviveIndex(JSON.parse(await adapter.read(this.path)));
    } catch {
      // Unreadable or corrupt: rebuilding is always available and always cheap
      // relative to losing something, because nothing here is user-authored.
      return emptyIndex();
    }
  }

  /** Queue a debounced write. Safe to call after every merged page. */
  save(index: IndexData): void {
    if (this.pending !== null) window.clearTimeout(this.pending);
    this.pending = window.setTimeout(() => {
      this.pending = null;
      void this.flush(index);
    }, WRITE_DEBOUNCE_MS);
  }

  /** Write now, and wait for it — used on unload and after a sync finishes. */
  async flush(index: IndexData): Promise<void> {
    if (this.pending !== null) {
      window.clearTimeout(this.pending);
      this.pending = null;
    }
    // Serialize writes so two flushes cannot interleave on the same file.
    this.writing = this.writing.then(async () => {
      try {
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists(this.dir))) await adapter.mkdir(this.dir);
        await adapter.write(this.path, JSON.stringify(index));
      } catch {
        // A failed write means a re-sync later, not lost work.
      }
    });
    await this.writing;
  }

  /** Forget the stored index entirely (the "rebuild" path). */
  async clear(): Promise<void> {
    if (this.pending !== null) {
      window.clearTimeout(this.pending);
      this.pending = null;
    }
    try {
      const adapter = this.app.vault.adapter;
      if (await adapter.exists(this.path)) await adapter.remove(this.path);
    } catch {
      // Nothing to do: the next write overwrites it anyway.
    }
  }
}
