import { afterEach, describe, expect, it, vi } from 'vitest';

// Shape of the live CMS text on 2026-11-25, shortened.
const PAGE = `<p>Графік погодинних відключень на 25.11.2026</p>
<p>Інформація станом на 15:41 25.11.2026</p>
<p>Група 1.1. Електроенергії немає з 20:30 до 24:00.</p>
<p>Група 1.2. Електроенергії немає з 08:00 до 09:30, з 18:00 до 19:00.</p>
<p>Група 4.2. Електроенергія є.</p>`;

const menu = items => ({ 'hydra:member': [{ type: 'photo-grafic', menuItems: items }] });
const respond = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

async function freshModule() {
  vi.resetModules();
  return import('./gpv.js');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseGpvHtml', () => {
  it('reads the date, the update time and every group line', async () => {
    const { parseGpvHtml } = await freshModule();
    expect(parseGpvHtml(PAGE)).toEqual({
      date: '25.11.2026',
      updated: '15:41 25.11.2026',
      groups: {
        '1.1': [{ from: '20:30', to: '24:00' }],
        '1.2': [{ from: '08:00', to: '09:30' }, { from: '18:00', to: '19:00' }],
        '4.2': [],
      },
    });
  });

  it('leaves a group out when its line does not parse', async () => {
    const { parseGpvHtml } = await freshModule();
    expect(parseGpvHtml('<p>Графік погодинних відключень на 25.11.2026</p><p>Група 5.1. Невідомий текст.</p>').groups).toEqual({});
  });
});

describe('getGpvSchedule', () => {
  it('serves today and an unpublished tomorrow as null', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(menu([{ name: 'Today', rawHtml: PAGE }, { name: 'Tomorrow', rawHtml: '' }]))));
    const { getGpvSchedule } = await freshModule();
    const schedule = await getGpvSchedule();
    expect(schedule).toMatchObject({ stale: false, tomorrow: null, today: { date: '25.11.2026' } });
  });

  it('resolves to null when it has never had a schedule', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const { getGpvSchedule } = await freshModule();
    expect(await getGpvSchedule()).toBeNull();
  });

  it('rejects a page in an unknown format instead of caching a clear day', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => respond(menu([{ name: 'Today', rawHtml: '<p>Новий формат сторінки</p>' }]))));
    const { getGpvSchedule } = await freshModule();
    expect(await getGpvSchedule()).toBeNull();
  });
});
