import { groundHeightAt } from './placement';

export interface BrickPlacement {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scaleX: number;
  scaleZ: number;
  toneSeed: number;
}

export interface PathTargetPoint {
  x: number;
  z: number;
  stopShortDist: number;
  seedOffset: number;
}

export const WOODEN_HOUSE_POS = { x: -6.8, z: -4.2 };

export function clampGrassCount(value: number): number {
  if (!Number.isFinite(value)) return 450;
  return Math.min(2500, Math.max(0, Math.round(value)));
}

export function clampStoneCount(value: number): number {
  if (!Number.isFinite(value)) return 18;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Generates hand-laid stone brick placements forming a ring around the central
 * clearing stone and connecting paths to the wooden house and every article tree.
 */
export function buildStoneBrickPaths(
  trees: Array<{ post_id: number; position_x: number; position_z: number }>,
  maxBricks = 2200,
): BrickPlacement[] {
  const bricks: BrickPlacement[] = [];
  const pushBrick = (b: BrickPlacement) => {
    if (bricks.length < maxBricks) {
      bricks.push(b);
    }
  };

  // 1. Central circular stone-brick apron around the center stone (radius ~2.35m)
  const ringRadius = 2.35;
  const ringCount = 24;
  for (let i = 0; i < ringCount; i++) {
    const theta = (i / ringCount) * Math.PI * 2;
    const x = Math.cos(theta) * ringRadius;
    const z = Math.sin(theta) * ringRadius;
    pushBrick({
      x,
      y: groundHeightAt(x, z) + 0.028,
      z,
      rotY: -theta + Math.PI / 2,
      scaleX: 0.96 + (i % 3) * 0.05,
      scaleZ: 0.94 + (i % 2) * 0.06,
      toneSeed: i * 17,
    });
  }

  // 2. Connect center stone (0,0) to Wooden House porch and to every tree
  const targets: PathTargetPoint[] = [
    {
      // Approach right up to the wooden house front porch
      x: WOODEN_HOUSE_POS.x + 1.45,
      z: WOODEN_HOUSE_POS.z + 2.05,
      stopShortDist: 0.2,
      seedOffset: 101,
    },
    ...trees.map((tr) => ({
      x: tr.position_x,
      z: tr.position_z,
      stopShortDist: 1.55,
      seedOffset: tr.post_id * 31,
    })),
  ];

  const startRadius = 2.65;
  const rowSpacing = 0.56;

  for (const target of targets) {
    const totalDist = Math.hypot(target.x, target.z);
    if (totalDist <= startRadius + target.stopShortDist + 0.4) continue;

    const dirX = target.x / totalDist;
    const dirZ = target.z / totalDist;
    const perpX = -dirZ;
    const perpZ = dirX;
    const baseAngle = Math.atan2(dirX, dirZ);

    const endDist = totalDist - target.stopShortDist;
    const usableLen = endDist - startRadius;
    const steps = Math.max(2, Math.floor(usableLen / rowSpacing));

    for (let s = 0; s <= steps; s++) {
      if (bricks.length >= maxBricks) break;
      const frac = s / steps;
      const d = startRadius + frac * usableLen;
      // Gentle natural curve that anchors cleanly to start and destination
      const meander = Math.sin(frac * Math.PI) * Math.sin(target.seedOffset * 0.7 + frac * 3.2) * 0.72;
      const cx = dirX * d + perpX * meander;
      const cz = dirZ * d + perpZ * meander;

      // Two staggered bricks side-by-side to form a welcoming ~1.25m stone brick walkway
      const stagger = s % 2 === 0 ? 0.14 : -0.14;
      for (const side of [-0.31, 0.31]) {
        const bx = cx + perpX * (side + stagger * 0.25) + dirX * stagger * 0.35;
        const bz = cz + perpZ * (side + stagger * 0.25) + dirZ * stagger * 0.35;
        const seed = target.seedOffset + s * 7 + (side > 0 ? 3 : 1);
        pushBrick({
          x: bx,
          y: groundHeightAt(bx, bz) + 0.025,
          z: bz,
          rotY: baseAngle + ((seed % 5) - 2) * 0.03,
          scaleX: 0.92 + (seed % 4) * 0.04,
          scaleZ: 0.92 + (seed % 3) * 0.05,
          toneSeed: seed,
        });
      }
    }
  }

  return bricks;
}
