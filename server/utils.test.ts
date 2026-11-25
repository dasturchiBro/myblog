import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReadingTime, sanitizeImageUrl, slugify } from './utils';

test('slugify handles Uzbek apostrophes and spaces cleanly', () => {
  assert.equal(slugify("O‘sayotgan O‘rmon va G‘oyalar"), 'osayotgan-ormon-va-goyalar');
  assert.equal(slugify('  The Art of Discipline! '), 'the-art-of-discipline');
});

test('calculateReadingTime returns at least 1 minute and scales by words', () => {
  assert.equal(calculateReadingTime(''), 1);
  const words450 = Array.from({ length: 450 }, () => 'word').join(' ');
  assert.equal(calculateReadingTime(words450), 3);
});

test('sanitizeImageUrl rejects javascript: URLs and allows uploads/https', () => {
  assert.equal(sanitizeImageUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeImageUrl('/uploads/cover-1.jpg'), '/uploads/cover-1.jpg');
  assert.equal(sanitizeImageUrl('https://example.com/a.png'), 'https://example.com/a.png');
});
