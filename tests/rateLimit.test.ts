import { describe, it, expect } from "vitest";
import {
  RateLimiter,
  retryAfterMs,
  READ_LIMIT_PER_MINUTE,
  WRITE_LIMIT_PER_MINUTE,
} from "../src/core/rateLimit";

/** A controllable clock, so no test ever waits on real time. */
function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => void (t += ms) };
}

describe("RateLimiter", () => {
  it("lets a full bucket through without delay", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(3, 60_000, clock.now);
    expect(limiter.reserve()).toBe(0);
    expect(limiter.reserve()).toBe(0);
    expect(limiter.reserve()).toBe(0);
  });

  it("delays once the budget is spent", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(3, 60_000, clock.now);
    limiter.reserve();
    limiter.reserve();
    limiter.reserve();
    expect(limiter.reserve()).toBeGreaterThan(0);
  });

  it("queues successive callers behind each other rather than colliding", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(2, 60_000, clock.now);
    limiter.reserve();
    limiter.reserve();
    const first = limiter.reserve();
    const second = limiter.reserve();
    expect(second).toBeGreaterThan(first);
  });

  it("refills continuously as time passes", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(6, 60_000, clock.now);
    for (let i = 0; i < 6; i++) limiter.reserve();
    expect(limiter.available()).toBe(0);
    clock.advance(30_000); // half a window → half the capacity back
    expect(limiter.available()).toBe(3);
  });

  it("never refills beyond capacity", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(4, 60_000, clock.now);
    limiter.reserve();
    clock.advance(10 * 60_000);
    expect(limiter.available()).toBe(4);
  });

  it("gives a slot back on release", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(2, 60_000, clock.now);
    limiter.reserve();
    expect(limiter.available()).toBe(1);
    limiter.release();
    expect(limiter.available()).toBe(2);
  });

  it("keeps read and write budgets independent", () => {
    const clock = fakeClock();
    const reads = new RateLimiter(READ_LIMIT_PER_MINUTE, 60_000, clock.now);
    const writes = new RateLimiter(WRITE_LIMIT_PER_MINUTE, 60_000, clock.now);
    for (let i = 0; i < READ_LIMIT_PER_MINUTE; i++) reads.reserve();
    expect(reads.reserve()).toBeGreaterThan(0);
    expect(writes.reserve()).toBe(0);
  });

  it("budgets below the published limits, because the token is shared", () => {
    expect(READ_LIMIT_PER_MINUTE).toBeLessThan(20);
    expect(WRITE_LIMIT_PER_MINUTE).toBeLessThan(50);
  });
});

describe("retryAfterMs", () => {
  it("reads a seconds value", () => {
    expect(retryAfterMs("30")).toBe(30_000);
    expect(retryAfterMs(" 5 ")).toBe(5000);
  });
  it("returns null for anything unusable", () => {
    expect(retryAfterMs(undefined)).toBeNull();
    expect(retryAfterMs("")).toBeNull();
    expect(retryAfterMs("soon")).toBeNull();
    expect(retryAfterMs("-1")).toBeNull();
  });
});
