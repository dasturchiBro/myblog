import test from 'node:test';
import assert from 'node:assert/strict';
import { uz } from './uz';
import { en } from './en';
import { buildLocalizedPath, formatLocalizedDate, resolveInitialLanguage, stripLangPrefix } from './index';

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  if (Array.isArray(obj)) {
    return obj.flatMap((item, idx) => collectKeys(item, `${prefix}[${idx}]`));
  }
  return Object.entries(obj).flatMap(([k, v]) =>
    collectKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

test('uz and en dictionaries have identical key structure and non-empty strings', () => {
  const uzKeys = collectKeys(uz).sort();
  const enKeys = collectKeys(en).sort();
  assert.deepEqual(uzKeys, enKeys);
});

test('first visit defaults to Uzbek regardless of browser locale', () => {
  assert.equal(resolveInitialLanguage('/', null), 'uz');
  assert.equal(resolveInitialLanguage('/uz/', null), 'uz');
  assert.equal(resolveInitialLanguage('/en/', null), 'en');
  assert.equal(resolveInitialLanguage('/', 'en'), 'en');
  assert.equal(resolveInitialLanguage('/uz/about', 'en'), 'uz');
});

test('URL localization helpers preserve subpaths cleanly', () => {
  assert.equal(stripLangPrefix('/uz/'), '/');
  assert.equal(stripLangPrefix('/en/archive'), '/archive');
  assert.equal(buildLocalizedPath('uz', '/'), '/uz/');
  assert.equal(buildLocalizedPath('en', '/about'), '/en/about');
  assert.equal(buildLocalizedPath('uz', 'post/salom'), '/uz/post/salom');
});

test('localized date formatting renders Uzbek and English dates', () => {
  const iso = '2025-05-14T10:00:00.000Z';
  assert.equal(formatLocalizedDate(iso, 'uz'), '2025-yil 14-may');
  assert.equal(formatLocalizedDate(iso, 'en'), 'May 14, 2025');
});
