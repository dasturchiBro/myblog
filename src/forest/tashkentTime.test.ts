import test from 'node:test';
import assert from 'node:assert/strict';
import { getTashkentHour, getTashkentTimeOfDay } from './tashkentTime';

test('getTashkentTimeOfDay maps UTC timestamps accurately to Asia/Tashkent (UTC+5)', () => {
  // 02:00 UTC -> 07:00 Tashkent -> morning
  assert.equal(getTashkentHour(new Date('2026-11-25T02:00:00.000Z')), 7);
  assert.equal(getTashkentTimeOfDay(new Date('2026-11-25T02:00:00.000Z')), 'morning');

  // 08:00 UTC -> 13:00 Tashkent -> afternoon (day)
  assert.equal(getTashkentHour(new Date('2026-11-25T08:00:00.000Z')), 13);
  assert.equal(getTashkentTimeOfDay(new Date('2026-11-25T08:00:00.000Z')), 'afternoon');

  // 13:00 UTC -> 18:00 Tashkent -> sunset
  assert.equal(getTashkentHour(new Date('2026-11-25T13:00:00.000Z')), 18);
  assert.equal(getTashkentTimeOfDay(new Date('2026-11-25T13:00:00.000Z')), 'sunset');

  // 18:00 UTC -> 23:00 Tashkent -> night
  assert.equal(getTashkentHour(new Date('2026-11-25T18:00:00.000Z')), 23);
  assert.equal(getTashkentTimeOfDay(new Date('2026-11-25T18:00:00.000Z')), 'night');
});
