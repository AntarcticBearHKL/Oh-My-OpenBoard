import { test, expect } from 'vitest';
import { formatElapsedDuration } from '../../src/modules/dateutils.js';

// ── formatElapsedDuration ───────────────────────────────────────────

test('formatElapsedDuration returns empty string for invalid or negative values', () => {
  expect(formatElapsedDuration(null)).toBe('');
  expect(formatElapsedDuration(undefined)).toBe('');
  expect(formatElapsedDuration(Number.NaN)).toBe('');
  expect(formatElapsedDuration(-1)).toBe('');
});

test('formatElapsedDuration shows under a minute', () => {
  expect(formatElapsedDuration(0)).toBe('<1m');
  expect(formatElapsedDuration(59_000)).toBe('<1m');
});

test('formatElapsedDuration shows whole minutes under an hour', () => {
  expect(formatElapsedDuration(60_000)).toBe('1m');
  expect(formatElapsedDuration(4 * 60_000)).toBe('4m');
  expect(formatElapsedDuration(59 * 60_000 + 59_000)).toBe('59m');
});

test('formatElapsedDuration shows hours with zero-padded minutes', () => {
  expect(formatElapsedDuration(60 * 60_000)).toBe('1h 00m');
  expect(formatElapsedDuration(65 * 60_000)).toBe('1h 05m');
  expect(formatElapsedDuration((23 * 60 + 59) * 60_000)).toBe('23h 59m');
});

test('formatElapsedDuration shows days with remaining hours', () => {
  expect(formatElapsedDuration(24 * 60 * 60_000)).toBe('1d');
  expect(formatElapsedDuration((24 * 2 + 3) * 60 * 60_000)).toBe('2d 3h');
  expect(formatElapsedDuration((24 * 2 + 3) * 60 * 60_000 + 59_000)).toBe('2d 3h');
});
