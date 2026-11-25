import type { TreeSpecies } from '../types';

export type GrowthStageKey =
  | 'seedling'
  | 'sapling'
  | 'young'
  | 'developing'
  | 'developed'
  | 'mature';

export interface GrowthMetrics {
  ageDays: number;
  /** Normalized growth parameter between 0.08 (seedling) and 1.0 (mature) */
  progress: number;
  stage: GrowthStageKey;
  heightScale: number;
  trunkRadiusScale: number;
  branchSpread: number;
  canopyScale: number;
  foliageDensity: number;
}

export const ALL_SPECIES: TreeSpecies[] = [
  'oak',
  'birch',
  'maple',
  'willow',
  'cherry',
  'walnut',
];

/**
 * Deterministic growth curve based on post age in days.
 * - Today (0 days) -> ~0.08 (seedling)
 * - 1 week (7 days) -> ~0.20 (sapling)
 * - 1 month (30 days) -> ~0.38 (young tree)
 * - 6 months (180 days) -> ~0.65 (developing tree)
 * - 1 year (365 days) -> ~0.80 (developed tree)
 * - 3+ years (1095+ days) -> ~0.95..1.00 (mature tree)
 */
export function computeGrowthMetrics(
  publishedAtIso: string,
  nowMs: number = Date.now(),
): GrowthMetrics {
  const pubMs = new Date(publishedAtIso).getTime();
  const safePubMs = Number.isNaN(pubMs) ? nowMs : pubMs;
  const ageDays = Math.max(0, (nowMs - safePubMs) / (1000 * 60 * 60 * 24));

  // Smooth logarithmic curve mapped to [0.08, 1.0]
  // Using log1p(ageDays / 10) / log1p(120) reaches ~0.98 at 3.3 years
  const rawCurve = Math.log1p(ageDays / 12) / Math.log1p(125);
  const progress = Math.min(1, Math.max(0.08, 0.08 + rawCurve * 0.92));

  let stage: GrowthStageKey = 'mature';
  if (ageDays < 5) stage = 'seedling';
  else if (ageDays < 21) stage = 'sapling';
  else if (ageDays < 90) stage = 'young';
  else if (ageDays < 270) stage = 'developing';
  else if (ageDays < 730) stage = 'developed';
  else stage = 'mature';

  // Continuous visual scaling derived from normalized progress
  const heightScale = 0.26 + Math.pow(progress, 0.85) * 0.84;
  const trunkRadiusScale = 0.26 + Math.pow(progress, 1.15) * 0.8;
  const branchSpread = Math.max(0.18, (progress - 0.05) / 0.95);
  const canopyScale = 0.28 + Math.pow(progress, 0.9) * 0.8;
  const foliageDensity = Math.min(1, 0.28 + progress * 0.72);

  return {
    ageDays,
    progress,
    stage,
    heightScale,
    trunkRadiusScale,
    branchSpread,
    canopyScale,
    foliageDensity,
  };
}
