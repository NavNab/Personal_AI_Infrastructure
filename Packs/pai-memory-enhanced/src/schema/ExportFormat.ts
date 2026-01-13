/**
 * Export Format - Cross-LLM memory portability
 *
 * JSON format for exporting memory to use with any LLM.
 */

import type { Fact } from './Fact';
import type { Hypothesis } from './Hypothesis';
import type { Project } from './BootstrapSlice';

export type SourceProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'meta'
  | 'mistral'
  | 'local'
  | 'other';

export type SourceModel =
  | 'claude-3-opus'
  | 'claude-3-sonnet'
  | 'claude-3-haiku'
  | 'claude-opus-4-5'
  | 'gpt-4'
  | 'gpt-4-turbo'
  | 'gpt-4o'
  | 'gemini-pro'
  | 'gemini-ultra'
  | 'llama-3'
  | 'mistral-large'
  | 'other';

export interface ExportMetadata {
  version: string; // Schema version
  exportedAt: string; // ISO 8601
  sourceModel: SourceModel;
  sourceProvider: SourceProvider;
  sessionId?: string;
  factCount: number;
  hypothesisCount: number;
  confidenceThresholdApplied: number;
}

export interface MemoryExport {
  exportMetadata: ExportMetadata;
  facts: Fact[];
  hypotheses: Hypothesis[];
  activeProject?: Project;
}

/**
 * Create export metadata
 */
export function createExportMetadata(
  sourceModel: SourceModel,
  sourceProvider: SourceProvider,
  factCount: number,
  hypothesisCount: number,
  confidenceThreshold: number = 0.75,
  sessionId?: string
): ExportMetadata {
  return {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    sourceModel,
    sourceProvider,
    sessionId,
    factCount,
    hypothesisCount,
    confidenceThresholdApplied: confidenceThreshold,
  };
}

/**
 * Create a complete memory export
 */
export function createMemoryExport(
  metadata: ExportMetadata,
  facts: Fact[],
  hypotheses: Hypothesis[],
  activeProject?: Project
): MemoryExport {
  return {
    exportMetadata: metadata,
    facts,
    hypotheses,
    activeProject,
  };
}

/**
 * Filter hypotheses by confidence threshold
 */
export function filterByConfidence(
  hypotheses: Hypothesis[],
  minObservations: number = 2
): Hypothesis[] {
  return hypotheses.filter((h) => h.observationCount >= minObservations);
}

/**
 * Validate export format version compatibility
 */
export function isCompatibleVersion(version: string): boolean {
  const [major] = version.split('.').map(Number);
  return major >= 1 && major <= 2;
}
