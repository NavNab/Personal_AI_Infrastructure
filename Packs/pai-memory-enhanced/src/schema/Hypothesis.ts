/**
 * Hypothesis interface - temporary memory items with expiry
 *
 * Observations start as hypotheses and promote to facts via confidence.
 */

import type { Cue } from './Cue';

export type HypothesisStatus = 'open' | 'promoted' | 'expired' | 'closed';
export type HypothesisPriority = 'normal' | 'resume' | 'action-needed' | 'urgent';

export interface Hypothesis {
  timestamp: string; // ISO 8601
  statement: string; // The hypothesis text
  cues: Cue[]; // Context triggers
  tags: string[]; // Classification
  expiresOrdinal: number; // Day ordinal when expires
  status: HypothesisStatus;
  observationCount: number; // For confidence calculation
  priority?: HypothesisPriority; // Priority level for surfacing (default: normal)
}

/**
 * Calculate day ordinal (days since epoch) for a Date
 */
export function dayOrdinal(date: Date = new Date()): number {
  return Math.floor(date.getTime() / 86400000);
}

/**
 * Create a new hypothesis with default expiry
 */
export function createHypothesis(
  statement: string,
  expiryDays: number = 7,
  cues: Cue[] = [],
  tags: string[] = [],
  priority: HypothesisPriority = 'normal'
): Hypothesis {
  const today = dayOrdinal();
  return {
    timestamp: new Date().toISOString(),
    statement,
    cues,
    tags,
    expiresOrdinal: today + Math.max(1, expiryDays),
    status: 'open',
    observationCount: 1,
    priority,
  };
}

/**
 * Check if hypothesis is high-priority (should always surface)
 */
export function isHighPriority(hypothesis: Hypothesis): boolean {
  return hypothesis.priority === 'resume' ||
         hypothesis.priority === 'action-needed' ||
         hypothesis.priority === 'urgent';
}

/**
 * Detect if a hypothesis statement indicates resume/action-needed
 * Used for legacy hypotheses without explicit priority
 */
export function detectPriority(statement: string): HypothesisPriority {
  const lowerStatement = statement.toLowerCase();
  if (lowerStatement.includes('resume reminder') ||
      lowerStatement.includes('continue with') ||
      lowerStatement.includes('pending')) {
    return 'resume';
  }
  if (lowerStatement.includes('action needed') ||
      lowerStatement.includes('blocked') ||
      lowerStatement.includes('awaiting')) {
    return 'action-needed';
  }
  if (lowerStatement.includes('urgent') ||
      lowerStatement.includes('critical')) {
    return 'urgent';
  }
  return 'normal';
}

/**
 * Check if a hypothesis has expired
 */
export function isExpired(hypothesis: Hypothesis): boolean {
  const today = dayOrdinal();
  return hypothesis.expiresOrdinal < today;
}

/**
 * Promote hypothesis to permanent fact status
 */
export function promoteHypothesis(hypothesis: Hypothesis): Hypothesis {
  return {
    ...hypothesis,
    status: 'promoted',
  };
}

/**
 * Reinforce hypothesis by incrementing observation count
 */
export function reinforceHypothesis(hypothesis: Hypothesis): Hypothesis {
  return {
    ...hypothesis,
    observationCount: hypothesis.observationCount + 1,
  };
}

/**
 * Extend hypothesis expiry date
 */
export function extendHypothesis(hypothesis: Hypothesis, additionalDays: number): Hypothesis {
  return {
    ...hypothesis,
    expiresOrdinal: hypothesis.expiresOrdinal + Math.max(1, additionalDays),
  };
}
