/**
 * Confidence Score interface - tracking validation strength
 *
 * Used for hypothesis-to-fact promotion decisions.
 */

import type { Evidence, EvidenceQuality } from './Evidence';

export interface ConfidenceScore {
  value: number; // 0.0-1.0
  lastUpdated: string; // ISO 8601
  evidenceCount: number;
  breakdown: {
    baseScore: number;
    evidenceBonus: number;
    observationBonus: number;
  };
}

/**
 * Quality weights for evidence scoring
 */
export const EVIDENCE_QUALITY_WEIGHTS: Record<EvidenceQuality, number> = {
  high: 0.3,
  medium: 0.2,
  low: 0.1,
};

/**
 * Calculate confidence score from evidence and observation count
 */
export function calculateConfidence(
  evidence: Evidence[],
  observationCount: number,
  baseThreshold: number = 3
): ConfidenceScore {
  const baseScore = Math.min(observationCount / baseThreshold, 0.5);

  const evidenceBonus = evidence.reduce((sum, e) => {
    return sum + EVIDENCE_QUALITY_WEIGHTS[e.quality];
  }, 0);

  const observationBonus = Math.min((observationCount - baseThreshold) * 0.1, 0.2);

  const value = Math.min(baseScore + evidenceBonus + observationBonus, 1.0);

  return {
    value,
    lastUpdated: new Date().toISOString(),
    evidenceCount: evidence.length,
    breakdown: {
      baseScore,
      evidenceBonus,
      observationBonus: Math.max(0, observationBonus),
    },
  };
}

/**
 * Check if confidence meets promotion threshold
 */
export function meetsPromotionThreshold(
  score: ConfidenceScore,
  threshold: number = 1.0
): boolean {
  return score.value >= threshold;
}
