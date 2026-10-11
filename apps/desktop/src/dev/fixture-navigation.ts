/** Keep an opt-in local reference fixture isolated while navigating between existing routes. */
export function preserveReferenceFixtureRoute(path: string): string {
  if (!import.meta.env.DEV) return path;
  const source = new URLSearchParams(window.location.search);
  const fixture = source.get('fixture');
  if (!fixture) return path;
  const destination = new URL(path, window.location.origin);
  destination.searchParams.set('fixture', fixture);
  const variant = source.get('variant');
  if (variant) destination.searchParams.set('variant', variant);
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
