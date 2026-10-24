import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom cannot resolve the custom-property cascade, so these guards read the CSS text. They pin the
// invariants that made the accent picker a no-op before: one token source, one accent variable.
const src = path.resolve(__dirname, '../apps/desktop/src');
const read = (file: string) => readFileSync(path.join(src, file), 'utf8');
const cssFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return name.endsWith('.css') ? [path.relative(src, full)] : [];
  });
const tokens = read('reference-tokens.css');
const accents = [...read('store.ts').matchAll(/accent: ((?:'[a-z]+'(?: \| )?)+);/g)]
  .flatMap((match) => match[1].split(' | '))
  .map((value) => value.replaceAll("'", ''));

describe('design tokens', () => {
  it('gives every accent preference its own higher-specificity root block', () => {
    expect(accents).toEqual(['pearl', 'sage']);
    for (const accent of accents)
      expect(tokens).toMatch(
        new RegExp(`:root\\[data-accent='${accent}'\\] \\{[^}]*--color-action-primary:`),
      );
  });

  it('declares the accent variables and data-accent selectors only in reference-tokens.css', () => {
    for (const file of cssFiles(src).filter((name) => name !== 'reference-tokens.css')) {
      const css = read(file);
      expect(css, file).not.toMatch(/--(accent|color-action-primary|color-action-focus)\s*:/);
      expect(css, file).not.toMatch(/\[data-accent/);
    }
  });

  it('derives every accent variant from the one accent variable', () => {
    for (const name of ['primaryHover', 'primaryActive', 'primarySubtle', 'primaryBorder', 'focus'])
      expect(tokens).toMatch(
        new RegExp(`--color-action-${name}: color-mix\\([^;]*var\\(--color-action-primary\\)`),
      );
    expect(tokens).toMatch(/--accent: var\(--color-action-primary\);/);
  });

  it('keeps one root token block and one focus ring', () => {
    for (const file of ['styles.css', 'reference-shell.css', 'interaction-quality.css'])
      expect(read(file), file).not.toMatch(/^:root\s*\{/m);
    const focusRules = ['styles.css', 'reference-shell.css', 'interaction-quality.css'].flatMap(
      (file) =>
        read(file).match(/^(?:button:focus-visible|:is\(button[^)]*\):focus-visible)/gm) ?? [],
    );
    expect(focusRules).toHaveLength(1);
  });

  it('defines the radius, type, z-index and floor scales', () => {
    for (const token of [
      '--radius-4',
      '--radius-8',
      '--radius-12',
      '--radius-16',
      '--radius-24',
      '--radius-pill',
      '--font-size-micro: 11px',
      '--z-dropdown',
      '--z-modal',
      '--z-toast',
      '--color-action-danger',
      '--color-background-overlay',
      '--shadow-1',
      '--shadow-2',
    ])
      expect(tokens).toContain(token);
    expect(tokens.match(/--radius-[a-z0-9]+:/g)).toHaveLength(6);
  });
});
