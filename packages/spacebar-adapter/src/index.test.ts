import { describe, expect, it } from 'vitest';
import { SpacebarError, validateInstanceUrl } from './index';
describe('social origin boundary', () => {
  it('permits secure production and loopback-only development origins', () => {
    expect(validateInstanceUrl('https://social.example.test/')).toBe('https://social.example.test');
    expect(validateInstanceUrl('http://127.0.0.1:3001')).toBe('http://127.0.0.1:3001');
    expect(validateInstanceUrl('http://localhost:3001')).toBe('http://localhost:3001');
  });
  it('rejects leaked credentials, nonlocal cleartext and ambiguous path/query origins', () => {
    for (const origin of ['http://192.168.1.2', 'http://social.example.test', 'https://token@example.test', 'https://example.test/api', 'https://example.test?token=secret', 'https://example.test#secret', 'file:///private']) expect(() => validateInstanceUrl(origin)).toThrow();
  });
  it('sanitizes authorization failures into actionable human errors', () => {
    expect(new SpacebarError(401, 'EXPIRED').message).toContain('Sign in again');
    expect(new SpacebarError(403, 'MISSING_PERMISSION').message).toContain('permission');
    expect(new SpacebarError(503, 'NETWORK').message).toContain('unavailable');
  });
});
