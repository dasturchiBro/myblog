import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGrowthMetrics } from './growth';

test('tree growth is monotonic and deterministic over publication age', () => {
  const now = new Date('2026-11-25T12:00:00.000Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const today = computeGrowthMetrics(new Date(now).toISOString(), now);
  const weekAgo = computeGrowthMetrics(new Date(now - 7 * dayMs).toISOString(), now);
  const monthAgo = computeGrowthMetrics(new Date(now - 30 * dayMs).toISOString(), now);
  const sixMonthsAgo = computeGrowthMetrics(new Date(now - 180 * dayMs).toISOString(), now);
  const yearAgo = computeGrowthMetrics(new Date(now - 365 * dayMs).toISOString(), now);
  const threeYearsAgo = computeGrowthMetrics(new Date(now - 1095 * dayMs).toISOString(), now);

  assert.equal(today.stage, 'seedling');
  assert.equal(weekAgo.stage, 'sapling');
  assert.equal(monthAgo.stage, 'young');
  assert.equal(sixMonthsAgo.stage, 'developing');
  assert.equal(yearAgo.stage, 'developed');
  assert.equal(threeYearsAgo.stage, 'mature');

  assert.ok(today.progress < weekAgo.progress);
  assert.ok(weekAgo.progress < monthAgo.progress);
  assert.ok(monthAgo.progress < sixMonthsAgo.progress);
  assert.ok(sixMonthsAgo.progress < yearAgo.progress);
  assert.ok(yearAgo.progress < threeYearsAgo.progress);
  assert.ok(threeYearsAgo.progress <= 1.0);
  assert.ok(today.progress >= 0.08);
});

test('future dates clamp safely to seedling stage', () => {
  const now = new Date('2026-11-25T12:00:00.000Z').getTime();
  const future = computeGrowthMetrics('2028-01-01T00:00:00.000Z', now);
  assert.equal(future.stage, 'seedling');
  assert.equal(future.ageDays, 0);
  assert.equal(future.progress, 0.08);
});
