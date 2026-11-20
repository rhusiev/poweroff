/**
 * Hourly outage schedule (ГПВ) published by Lvivoblenergo.
 *
 * The schedule is CMS content: a "photo-grafic" menu holds a "Today" item
 * whose rawHtml carries one paragraph per group. The browser cannot read it
 * directly (no CORS, and the menu payload is ~2 MB because of the archive
 * children), so the server extracts and caches the text.
 */

const CMS_MENU_URL = 'https://api.loe.lviv.ua/api/menus?page=1&type=photo-grafic';
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;

/** @type {{ data: import('../src/api/types').GpvSchedule, at: number } | null} */
let cached = null;
/** @type {Promise<import('../src/api/types').GpvSchedule> | null} */
let pending = null;

function emptySchedule() {
  return { date: null, updated: null, groups: {}, stale: false };
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToLines(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, '\n'))
    .split('\n')
    .map(line => line.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);
}

function normalizeTime(value) {
  const [hours, minutes] = value.split(':');
  return `${hours.padStart(2, '0')}:${minutes}`;
}

/**
 * @param {string} rawHtml
 * @returns {import('../src/api/types').GpvSchedule}
 */
export function parseGpvHtml(rawHtml) {
  const schedule = emptySchedule();
  if (!rawHtml) return schedule;

  const lines = htmlToLines(rawHtml);

  for (const line of lines) {
    const dateMatch = line.match(/Графік погодинних відключень на\s+(\d{2}\.\d{2}\.\d{4})/);
    if (dateMatch) schedule.date = dateMatch[1];

    const updatedMatch = line.match(/Інформація станом на\s+(\d{2}:\d{2}\s+\d{2}\.\d{2}\.\d{4})/);
    if (updatedMatch) schedule.updated = updatedMatch[1];

    const groupMatch = line.match(/Група\s+(\d\.\d)\s*\.\s*(.*)$/);
    if (!groupMatch) continue;

    const [, group, rest] = groupMatch;
    const windows = [];
    const windowPattern = /з\s+(\d{1,2}:\d{2})\s+до\s+(\d{1,2}:\d{2})/g;
    let windowMatch;
    while ((windowMatch = windowPattern.exec(rest)) !== null) {
      windows.push({ from: normalizeTime(windowMatch[1]), to: normalizeTime(windowMatch[2]) });
    }
    if (windows.length) schedule.groups[group] = windows;
  }

  return schedule;
}

async function fetchTodaySchedule() {
  const response = await fetch(CMS_MENU_URL, {
    headers: { Accept: 'application/ld+json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`CMS responded ${response.status}`);

  const payload = await response.json();
  const menus = Array.isArray(payload) ? payload : payload['hydra:member'] ?? [];
  const menu = menus.find(item => item.type === 'photo-grafic') ?? menus[0];
  const items = menu?.menuItems ?? [];
  const today = items.find(item => item.name?.trim().toLowerCase() === 'today') ?? items[0];

  if (!today?.rawHtml) throw new Error('CMS schedule text is empty');

  return parseGpvHtml(today.rawHtml);
}

/** @returns {Promise<import('../src/api/types').GpvSchedule>} */
export async function getGpvSchedule() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  if (pending) return pending;

  pending = fetchTodaySchedule()
    .then(data => {
      cached = { data, at: Date.now() };
      return data;
    })
    .catch(error => {
      console.error(`[gpv] schedule fetch failed: ${error.message}`);
      return cached ? { ...cached.data, stale: true } : { ...emptySchedule(), stale: true };
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}
