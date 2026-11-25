import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTreePlacement, groundHeightAt } from './placement';

test('tree placement keeps trees outside the central clearing and respects spacing', () => {
  const existing: Array<{ post_id: number; position_x: number; position_z: number }> = [];

  for (let id = 1; id <= 15; id++) {
    const sectorAngle = ((id % 5) / 5) * Math.PI * 2;
    const placed = computeTreePlacement({
      postId: id,
      sectorAngleRad: sectorAngle,
      ageRankRatio: id / 15,
      existingTrees: existing,
    });

    const distFromOrigin = Math.hypot(placed.position_x, placed.position_z);
    assert.ok(distFromOrigin >= 11.4, `Tree ${id} inside clearing: ${distFromOrigin}`);
    assert.equal(placed.position_y, Number(groundHeightAt(placed.position_x, placed.position_z).toFixed(3)));

    for (const prev of existing) {
      const sep = Math.hypot(placed.position_x - prev.position_x, placed.position_z - prev.position_z);
      assert.ok(sep >= 5.3, `Trees ${id} and ${prev.post_id} too close: ${sep}`);
    }

    existing.push({
      post_id: id,
      position_x: placed.position_x,
      position_z: placed.position_z,
    });
  }
});

test('tree placement is deterministic for identical inputs', () => {
  const a = computeTreePlacement({
    postId: 42,
    sectorAngleRad: 1.2,
    ageRankRatio: 0.4,
    existingTrees: [],
  });
  const b = computeTreePlacement({
    postId: 42,
    sectorAngleRad: 1.2,
    ageRankRatio: 0.4,
    existingTrees: [],
  });
  assert.deepEqual(a, b);
});
