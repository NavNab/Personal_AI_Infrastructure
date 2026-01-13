/**
 * Evidence interface - supporting data for hypothesis validation
 * Used in confidence calculations
 */

export type EvidenceType =
  | 'test_output'
  | 'user_feedback'
  | 'reasoning'
  | 'external_source'
  | 'manual_validation';

export type EvidenceQuality = 'high' | 'medium' | 'low';

export interface Evidence {
  type: EvidenceType;
  timestamp: string; // ISO 8601
  source: string;
  quality: EvidenceQuality;
  referenceLink?: string;
}

export function createEvidence(
  type: EvidenceType,
  source: string,
  quality: EvidenceQuality = 'medium',
  referenceLink?: string
): Evidence {
  return {
    type,
    timestamp: new Date().toISOString(),
    source,
    quality,
    referenceLink,
  };
}
