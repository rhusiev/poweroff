import { normalizeStreetName } from './geo';

/** Normalize case, spacing and punctuation without dropping initials. */
export function directoryKey(name: string): string {
  return name.normalize('NFKC').toLowerCase()
    .replace(/[.,'’\-–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (name: string) => directoryKey(name).split(' ').filter(Boolean);

/** Two rows name one street when an initial abbreviates the other row's word. */
export function sameOfficialStreet(a: string, b: string): boolean {
  const left = words(a);
  const right = words(b);
  if (!left.length || left.length !== right.length) return false;
  return left.every((word, index) => {
    const other = right[index];
    if (word === other) return true;
    if (word.length === 1) return other.startsWith(word);
    if (other.length === 1) return word.startsWith(other);
    return false;
  });
}

/** Match a partial stem against any word of the official name. */
export function matchesDirectoryName(name: string, query: string): boolean {
  const wanted = normalizeStreetName(query).split(' ').filter(Boolean);
  if (!wanted.length) return true;
  const official = normalizeStreetName(name).split(' ').filter(Boolean);
  return wanted.every(part => official.some(word => word.startsWith(part) || part.startsWith(word)));
}

/** Keep one row per official street, preferring the fuller spelling. */
export function uniqueOfficialNames<T extends { id: number; name: string }>(items: T[]): T[] {
  const result: T[] = [];
  for (const item of items) {
    if (!directoryKey(item.name)) continue;
    const index = result.findIndex(kept => sameOfficialStreet(kept.name, item.name));
    if (index === -1) {
      result.push(item);
    } else if (item.name.length > result[index].name.length) {
      result[index] = item;
    }
  }
  return result;
}
