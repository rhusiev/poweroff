import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_TIMEOUT_MS, withTimeout } from './net';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('withTimeout', () => {
  it('aborts a request that runs past the limit with a timeout, not a silent abort', () => {
    const signal = withTimeout();
    vi.advanceTimersByTime(REQUEST_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe('TimeoutError');
  });

  it("passes the caller's abort through at once", () => {
    const caller = new AbortController();
    const signal = withTimeout(caller.signal);
    caller.abort();
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe('AbortError');
  });

  it('starts aborted when the caller already aborted', () => {
    const caller = new AbortController();
    caller.abort();
    expect(withTimeout(caller.signal).aborted).toBe(true);
  });
});
