import { afterEach, describe, expect, it, vi } from 'vitest';

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

async function freshGeo() {
  vi.resetModules();
  return import('./geo');
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('nominatim queue', () => {
  it('spaces requests at least 1.1 s apart and fetches each URL once', async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    vi.stubGlobal('fetch', vi.fn(() => { starts.push(Date.now()); return ok([]); }));
    const { nominatim } = await freshGeo();
    const params = (q: string) => new URLSearchParams({ q });

    const all = Promise.all([nominatim('search', params('a')), nominatim('search', params('b')), nominatim('search', params('a'))]);
    await vi.runAllTimersAsync();
    await all;
    await nominatim('search', params('b'));

    expect(starts).toHaveLength(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1100);
  });

  it('skips a queued request that was aborted before its turn', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => ok([]));
    vi.stubGlobal('fetch', fetchMock);
    const { nominatim } = await freshGeo();
    const controller = new AbortController();

    const first = nominatim('search', new URLSearchParams({ q: 'one' }));
    const second = expect(nominatim('search', new URLSearchParams({ q: 'two' }), controller.signal)).rejects.toThrow('Aborted');
    controller.abort();
    await vi.runAllTimersAsync();

    await first;
    await second;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a refused request instead of returning no results', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 429 } as Response)));
    const { geocode } = await freshGeo();
    await expect(geocode('Городоцька')).rejects.toThrow('429');
  });
});
