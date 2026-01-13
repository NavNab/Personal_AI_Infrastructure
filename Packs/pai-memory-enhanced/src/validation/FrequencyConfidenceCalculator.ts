/**
 * Frequency-Based Confidence Calculator
 *
 * Calculates confidence score based on observation count.
 * confidence = observation_count / promotion_threshold
 *
 * A hypothesis is ready for promotion when confidence >= 1.0
 * (i.e., observation count meets or exceeds the threshold).
 */

import { CONFIG } from '../config/defaults';
import type { Hypothesis } from '../schema/Hypothesis';

export interface FrequencyConfidenceResult {
  observationCount: number;
  threshold: number;
  confidence: number; // 0.0 to 1.0+
  readyForPromotion: boolean;
}

/**
 * Calculate frequency-based confidence score
 * Returns a value between 0.0 and 1.0+ based on observation count
 */
export function calculateFrequencyConfidence(
  hypothesis: Hypothesis,
  threshold: number = CONFIG.promotionThreshold
): FrequencyConfidenceResult {
  const observationCount = hypothesis.observationCount;
  const confidence = observationCount / threshold;

  return {
    observationCount,
    threshold,
    confidence,
    readyForPromotion: confidence >= 1.0,
  };
}

/**
 * Format confidence as visual progress bar
 */
export function formatConfidence(result: FrequencyConfidenceResult): string {
  const pct = Math.min(100, Math.round(result.confidence * 100));
  const filled = Math.floor(pct / 10);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
  return `[${bar}] ${pct}% (${result.observationCount}/${result.threshold})`;
}

/**
 * Check if hypothesis has enough observations for promotion
 */
export function isReadyForPromotion(
  hypothesis: Hypothesis,
  threshold: number = CONFIG.promotionThreshold
): boolean {
  return hypothesis.observationCount >= threshold;
}

/**
 * Get remaining observations needed for promotion
 */
export function observationsNeeded(
  hypothesis: Hypothesis,
  threshold: number = CONFIG.promotionThreshold
): number {
  return Math.max(0, threshold - hypothesis.observationCount);
}
