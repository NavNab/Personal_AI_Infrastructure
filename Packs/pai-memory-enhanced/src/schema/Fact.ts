/**
 * Fact interface - permanent memory items
 *
 * Validated facts that have been promoted from hypotheses.
 */

export type FactImportance = 'low' | 'medium' | 'high';

export interface Fact {
  timestamp: string; // ISO 8601
  key: string; // Fact identifier
  value: string; // Fact content
  tags: string[]; // Classification tags
  importance: FactImportance;
  observationCount?: number; // For confidence tracking
}

export function createFact(
  key: string,
  value: string,
  tags: string[] = [],
  importance: FactImportance = 'medium'
): Fact {
  return {
    timestamp: new Date().toISOString(),
    key,
    value,
    tags,
    importance,
    observationCount: 1,
  };
}

/**
 * Update observation count for reinforcement learning
 */
export function reinforceFact(fact: Fact): Fact {
  return {
    ...fact,
    observationCount: (fact.observationCount ?? 1) + 1,
  };
}
