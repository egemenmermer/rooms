import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const compose = readFileSync(join(__dirname, '../infra/claude-bot/compose.yml'), 'utf8');
const setting = (name: string) =>
  new RegExp(`^\\s+${name}:\\s*(.+)$`, 'm').exec(compose)?.[1]?.trim() ?? null;

describe('@claude deployment defaults', () => {
  it('keeps production operations off unless the operator enables them', () => {
    expect(setting('ROOMS_CLAUDE_PROD_OPS')).toBe('${ROOMS_CLAUDE_PROD_OPS:-disabled}');
  });

  it('keeps the container unprivileged', () => {
    expect(compose).toMatch(/cap_drop: \[ALL\]/);
    expect(compose).toMatch(/no-new-privileges:true/);
    expect(compose).not.toMatch(/docker\.sock/);
  });
});
