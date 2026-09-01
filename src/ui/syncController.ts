// Owns "a sync is running": progress notices, cancellation, coalescing.
//
// Coalescing matters more than it looks. A sync is triggered by plugin load, by
// the panel's refresh button and by settings — and a user who clicks "Sync now"
// three times should not queue three full pulls against a rate-limited token.

import { Notice } from "obsidian";
import { runSync, type SyncOptions, type SyncResult } from "../core/sync";
import type { IndexData } from "../core/index";
import type { ReadwiseClient } from "../api/client";

export interface SyncHost {
  index: IndexData;
  getClient(): ReadwiseClient | null;
  persistIndex(): Promise<void>;
  onIndexChanged(): void;
}

export class SyncController {
  private running: Promise<SyncResult | null> | null = null;
  private cancelled = false;

  constructor(private readonly host: SyncHost) {}

  get isRunning(): boolean {
    return this.running !== null;
  }

  /** Ask the in-flight sync to stop at the next page boundary. */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Run a sync, or join the one already running. Returns null when no token is
   * configured; the caller decides whether that is worth telling the user.
   */
  run(options: SyncOptions = {}, notify = true): Promise<SyncResult | null> {
    if (this.running) return this.running;
    this.cancelled = false;
    this.running = this.execute(options, notify).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async execute(
    options: SyncOptions,
    notify: boolean,
  ): Promise<SyncResult | null> {
    const client = this.host.getClient();
    if (!client) return null;

    // A long first sync must be visible and interruptible; a one-request delta
    // should not flash a notice at all.
    const notice = notify ? new Notice("Readwise: syncing…", 0) : null;

    try {
      const result = await runSync(
        this.host.index,
        {
          exportPage: (params) => client.exportHighlights(params),
          documentPage: (params) => client.listDocuments(params),
        },
        {
          ...options,
          isCancelled: () => this.cancelled,
          onProgress: (progress) => {
            notice?.setMessage(
              progress.phase === "documents"
                ? `Readwise: ${progress.documents} documents (${progress.requests} requests)…`
                : `Readwise: ${progress.highlights} highlights from ${progress.sources} sources (${progress.requests} requests)…`,
            );
          },
        },
      );

      await this.host.persistIndex();
      this.host.onIndexChanged();

      notice?.hide();
      if (notify) new Notice(summarize(result), 6000);
      return result;
    } catch (e) {
      notice?.hide();
      const message = e instanceof Error ? e.message : String(e);
      // Partial progress is still worth keeping — the watermark is only stamped
      // on a clean finish, so a half-done index cannot masquerade as complete.
      await this.host.persistIndex();
      if (notify) new Notice(`Readwise sync failed: ${message}`, 8000);
      return null;
    }
  }
}

function summarize(result: SyncResult): string {
  if (result.cancelled) {
    return `Readwise: sync cancelled after ${result.requests} requests. Partial results kept.`;
  }
  const parts = [
    `${result.highlights} highlights from ${result.sources} sources`,
  ];
  if (result.documents > 0) parts.push(`${result.documents} documents`);
  parts.push(`${result.requests} requests`);
  let message = `Readwise: synced ${parts.join(", ")}.`;
  if (result.unjoined > 0) {
    // Kindle books and podcasts have no Reader document. Saying so once beats
    // leaving the user to wonder why a count looks short.
    message += ` ${result.unjoined} sources are not in Reader and were skipped.`;
  }
  return message;
}
