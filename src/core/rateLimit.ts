// Client-side rate limiting. Readwise limits per access token, per endpoint:
// 20 requests/minute for reads (list, tags, export) and 50/minute for writes
// (save, update). Exceeding a limit returns 429 with a `Retry-After` header.
//
// Two reasons this is not optional. First, the initial sync is a burst of paged
// requests and would trip the limit immediately. Second — and less obvious — the
// limit is per *token*, and the user's token is very likely also in use by the
// official plugin, the Readwise MCP server, a CLI or a Zapier hook. We therefore
// budget *below* the published limit rather than up to it, and treat a 429 as a
// normal response to absorb rather than an exceptional one.
//
// Pure and clock-injectable → unit-tested without waiting for real time.

/** A token bucket that refills continuously at `capacity` tokens per window. */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    /** Requests permitted per window. */
    private readonly capacity: number,
    /** Window length in milliseconds. */
    private readonly windowMs: number = 60_000,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  /**
   * Milliseconds the caller must wait before its request fits in the budget, and
   * consume that slot. Returns 0 when a slot is free right now.
   *
   * The slot is consumed either way: callers are expected to honour the delay,
   * and pretending otherwise would let a burst of callers each see "0".
   */
  reserve(): number {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    // Time until the bucket accrues the fraction of a token still missing.
    const perToken = this.windowMs / this.capacity;
    const missing = 1 - this.tokens;
    this.tokens -= 1; // may go negative: queues the caller behind earlier ones
    return Math.ceil(missing * perToken);
  }

  /** Requests currently available without waiting (never negative). */
  available(): number {
    this.refill();
    return Math.max(0, Math.floor(this.tokens));
  }

  /** Give back a slot reserved for a request that was never sent. */
  release(): void {
    this.refill();
    this.tokens = Math.min(this.capacity, this.tokens + 1);
  }

  private refill(): void {
    const now = this.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.lastRefill = now;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (elapsed / this.windowMs) * this.capacity,
    );
  }
}

/**
 * Readwise's published per-endpoint limits, reduced by a safety margin because
 * the token is shared with whatever else the user runs (see above).
 */
export const READ_LIMIT_PER_MINUTE = 18; // published: 20
export const WRITE_LIMIT_PER_MINUTE = 45; // published: 50

/** Parse a `Retry-After` header (seconds) into milliseconds, if present. */
export function retryAfterMs(header: string | undefined): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header.trim(), 10);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds * 1000;
}
