import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

// App.tsx mounts the whole runtime, so these guards read the source and CSS text instead.
const src = path.resolve(__dirname, '../apps/desktop/src');
const app = readFileSync(path.join(src, 'App.tsx'), 'utf8');
const css = readFileSync(path.join(src, 'minimal-room.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector!.trim(),
  body: body!,
}));

it('shows the channel chat heading and leaves the name out of the toolbar there', () => {
  // The blanket hide stays for other chat mounts; the scoped rule outranks it (0,4,0 > 0,2,0).
  expect(
    rules.some(
      (rule) =>
        /(^|,)\s*\.minimal-room-ui \.chat-heading\s*(,|$)/.test(rule.selector) &&
        /display:\s*none/.test(rule.body),
    ),
  ).toBe(true);
  const heading = rules.find(
    (rule) =>
      rule.selector === '.minimal-room-ui .room-conversation > .reference-chat > .chat-heading',
  );
  expect(heading?.body).toMatch(/display:\s*flex/);
  expect(app).toContain('{!chatHeadingVisible && <span title={breadcrumb}>{breadcrumb}</span>}');
});

it('keeps one activity icon and no duplicate search in the toolbar', () => {
  expect(app).not.toMatch(/\bRocket\b/);
  expect(app).toMatch(/label=\{t\('Etkinlikler'\)\}[\s\S]{0,240}<LayoutGrid size=\{19\} \/>/);
  const menu = app.slice(app.indexOf("<QuietMenu label={t('Oda işlemleri')}"));
  expect(menu.slice(0, menu.indexOf('</QuietMenu>'))).not.toContain("t('Ara')");
});

it('limits the preview label to development and drops the static private-community label', () => {
  expect(app).toMatch(
    /import\.meta\.env\.DEV && !window\.rooms && !localFixture && \(\s*<span className="browser-preview">/,
  );
  expect(app).not.toContain("t('Özel topluluk')");
});

it('uses the shared loading view for lazy Settings', () => {
  expect(app).not.toContain(`<div className="loading-view">{t('Yükleniyor…')}</div>`);
  expect(app.match(/<Suspense fallback=\{<LoadingView \/>\}>/g)).toHaveLength(2);
});

it('keeps the shell CSS at or above the 11px font floor', () => {
  const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) =>
    Number(match[1]),
  );
  expect(sizes.filter((size) => size < 11)).toEqual([]);
});
