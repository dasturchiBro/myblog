export interface ExistingTreeCoord {
  post_id: number;
  position_x: number;
  position_z: number;
}

export interface PlacementResult {
  position_x: number;
  position_y: number;
  position_z: number;
  rotation: number;
  scale_seed: number;
}

/**
 * Deterministic terrain height function shared between Three.js terrain mesh,
 * server placement, rocks, grass, and tree grounding.
 * Leaves a calm flat-ish central clearing around (0, 0) of radius ~9m.
 */
export function groundHeightAt(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);
  const clearingBlend = Math.min(1, Math.max(0, (distFromCenter - 6) / 14));

  const rollingHills =
    Math.sin(x * 0.055) * Math.cos(z * 0.055) * 1.45 +
    Math.sin(x * 0.13 + 1.2) * Math.sin(z * 0.11 - 0.4) * 0.48 +
    Math.cos((x + z) * 0.04) * 0.65;

  // Gentle bowl rise at distant perimeter (> 55m) for natural enclosure
  const rimRise = Math.max(0, distFromCenter - 52) * 0.095;

  return rollingHills * clearingBlend + rimRise;
}

/**
 * Simple deterministic PRNG seeded by integer ID.
 */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Computes deterministic, non-overlapping spatial coordinates within a category sector,
 * preserving existing trees without moving them when new posts are published.
 */
export function computeTreePlacement(params: {
  postId: number;
  sectorAngleRad: number;
  ageRankRatio: number; // 0 = oldest (closer to inner grove), 1 = newest (outer meadow)
  existingTrees: ExistingTreeCoord[];
}): PlacementResult {
  const { postId, sectorAngleRad, ageRankRatio, existingTrees } = params;
  const rng = mulberry32(postId * 2654435761);

  const minClearingRadius = 11.5;
  const maxForestRadius = 46;
  const minSpacing = 5.4;

  // Older trees naturally settle closer to the established inner grove (12..24m),
  // newer trees expand outward into fresh clearings (18..42m) while staying clustered by sector.
  const preferredBaseRadius =
    minClearingRadius + 2.5 + ageRankRatio * 20 + rng() * 5;

  let chosenX = Math.cos(sectorAngleRad) * preferredBaseRadius;
  let chosenZ = Math.sin(sectorAngleRad) * preferredBaseRadius;

  for (let attempt = 0; attempt < 96; attempt++) {
    const spreadAngle = (rng() - 0.5) * (0.95 + attempt * 0.025);
    const angle = sectorAngleRad + spreadAngle;
    const radialJitter = (rng() - 0.35) * (6 + attempt * 0.35);
    const radius = Math.min(
      maxForestRadius,
      Math.max(minClearingRadius, preferredBaseRadius + radialJitter),
    );

    const candidateX = Math.cos(angle) * radius;
    const candidateZ = Math.sin(angle) * radius;

    // Ensure it stays outside central stone clearing
    if (Math.hypot(candidateX, candidateZ) < minClearingRadius) continue;

    // Avoid footpaths radiating along 0, PI/2, PI, -PI/2 within 1.8m
    const onCardinalPath =
      (Math.abs(candidateX) < 1.9 && candidateZ > 0) ||
      (Math.abs(candidateZ) < 1.9 && Math.abs(candidateX) > 4);
    if (onCardinalPath && attempt < 40) continue;

    const tooClose = existingTrees.some(
      (t) =>
        t.post_id !== postId &&
        Math.hypot(t.position_x - candidateX, t.position_z - candidateZ) < minSpacing,
    );

    if (!tooClose) {
      chosenX = candidateX;
      chosenZ = candidateZ;
      break;
    }
  }

  return {
    position_x: Number(chosenX.toFixed(3)),
    position_y: Number(groundHeightAt(chosenX, chosenZ).toFixed(3)),
    position_z: Number(chosenZ.toFixed(3)),
    rotation: Number((rng() * Math.PI * 2).toFixed(4)),
    scale_seed: Number((0.9 + rng() * 0.22).toFixed(4)),
  };
}
