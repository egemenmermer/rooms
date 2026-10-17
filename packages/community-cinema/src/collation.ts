// Name ordering for categories and channels: the Turkish alphabet (C < Ç,
// I < İ), case- and accent-insensitive otherwise, digit runs as numbers
// (TRT 2 < TRT 10). Kanal builds its own keys; Intl gives the same order.
const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'accent' });

export function compareNames(a: string, b: string) {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Stable sort of `items` by `nameOf`. */
export function sortByName<T>(items: Iterable<T>, nameOf: (item: T) => string): T[] {
  return [...items]
    .map((item, index) => ({ item, index, name: nameOf(item) }))
    .sort((a, b) => compareNames(a.name, b.name) || a.index - b.index)
    .map(({ item }) => item);
}
