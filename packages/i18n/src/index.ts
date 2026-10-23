/**
 * Shared message lookup for the renderer, the Electron main process and the packages they use.
 *
 * The Turkish source text written in the code is the message key: `t('{name} katıldı', { name })`.
 * Turkish returns the source as written; English looks the source up in the catalog and falls back
 * to the Turkish source when a message is missing. See docs/I18N.md.
 */
export type Locale = 'tr' | 'en';
export type LocalePreference = 'system' | Locale;
/** English plural forms, chosen by the `count` variable. Turkish sources never need them. */
export interface PluralMessage {
  one: string;
  other: string;
}
export type CatalogMessage = string | PluralMessage;
export type Catalog = Readonly<Record<string, CatalogMessage>>;
export type MessageVars = Readonly<Record<string, string | number>>;

let current: Locale = 'tr';
let catalog: Catalog = {};
let reportMissing: ((source: string) => void) | undefined;

export function configureI18n(options: {
  locale: Locale;
  catalog?: Catalog;
  onMissing?: (source: string) => void;
}): void {
  current = options.locale;
  catalog = options.catalog ?? {};
  reportMissing = options.onMissing;
}

export function getLocale(): Locale {
  return current;
}

/** The BCP 47 tag for Intl date, number and collation APIs. */
export function intlLocale(locale: Locale = current): 'tr-TR' | 'en-US' {
  return locale === 'tr' ? 'tr-TR' : 'en-US';
}

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'system' || value === 'tr' || value === 'en';
}

export function parseLocale(value: unknown): Locale | null {
  return value === 'tr' || value === 'en' ? value : null;
}

/**
 * Turkish when the system's first language is Turkish or its region is Turkey (macOS reports
 * "en-TR" for English set up in Turkey); English everywhere else.
 */
export function resolveLocale(
  preference: LocalePreference,
  systemLanguages: readonly string[],
): Locale {
  if (preference !== 'system') return preference;
  const [first = ''] = systemLanguages;
  const [language = '', ...rest] = first.replace('_', '-').toLowerCase().split('-');
  return language === 'tr' || rest.includes('tr') ? 'tr' : 'en';
}

function interpolate(message: string, vars: MessageVars | undefined): string {
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}

function pick(message: CatalogMessage, vars: MessageVars | undefined): string {
  if (typeof message === 'string') return message;
  const count = Number(vars?.count);
  return Number.isFinite(count) && new Intl.PluralRules('en-US').select(count) === 'one'
    ? message.one
    : message.other;
}

/** The catalog entry for a source, if the active locale has one. */
export function lookup(source: string): CatalogMessage | undefined {
  return current === 'tr' || !Object.hasOwn(catalog, source) ? undefined : catalog[source];
}

/** Translate a Turkish source message and fill its `{name}` placeholders. */
export function t(source: string, vars?: MessageVars): string {
  if (current === 'tr') return interpolate(source, vars);
  const message = lookup(source);
  if (message === undefined) {
    reportMissing?.(source);
    return interpolate(source, vars);
  }
  return interpolate(pick(message, vars), vars);
}

/** Placeholder names in a message, for catalog checks. */
export function placeholders(message: CatalogMessage): string[] {
  const text = typeof message === 'string' ? message : `${message.one} ${message.other}`;
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!))].sort();
}
