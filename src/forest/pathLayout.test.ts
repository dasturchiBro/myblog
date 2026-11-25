import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoneBrickPaths, clampGrassCount, clampStoneCount, WOODEN_HOUSE_POS } from './pathLayout';

test('vegetation count clamping enforces safe bounds', () => {
  assert.equal(clampGrassCount(-10), 0);
  assert.equal(clampGrassCount(450), 450);
  assert.equal(clampGrassCount(9999), 2500);
  assert.equal(clampGrassCount(Number.NaN), 450);

  assert.equal(clampStoneCount(-5), 0);
  assert.equal(clampStoneCount(18), 18);
  assert.equal(clampStoneCount(500), 100);
  assert.equal(clampStoneCount(Number.NaN), 18);
});

test('stone brick path connects center stone, wooden house, and trees without overflowing', () => {
  const sampleTrees = [
    { post_id: 1, position_x: 12, position_z: 8 },
    { post_id: 2, position_x: -14, position_z: 10 },
  ];

  const bricks = buildStoneBrickPaths(sampleTrees, 2200);
  assert.ok(bricks.length > 40, 'should create apron + house path + tree paths');
  assert.ok(bricks.length <= 2200, 'should respect maxBricks limit');

  // Verify bricks approach near the wooden house porch
  const porchTargetX = WOODEN_HOUSE_POS.x + 1.45;
  const porchTargetZ = WOODEN_HOUSE_POS.z + 2.05;
  const nearHouse = bricks.some(
    (b) => Math.hypot(b.x - porchTargetX, b.z - porchTargetZ) < 1.2,
  );
  assert.ok(nearHouse, 'stone brick path must reach close to wooden house porch');

  // Verify bricks stop safely short of tree trunks (~1.4m-2.5m from trunk center)
  for (const tr of sampleTrees) {
    const insideTrunk = bricks.some(
      (b) => Math.hypot(b.x - tr.position_x, b.z - tr.position_z) < 0.9,
    );
    assert.equal(insideTrunk, false, 'path bricks must not overlap tree trunk');

    const approachesTree = bricks.some(
      (b) => Math.hypot(b.x - tr.position_x, b.z - tr.position_z) < 2.6,
    );
    assert.ok(approachesTree, 'path bricks must lead up to each tree clearing');
  }
});
