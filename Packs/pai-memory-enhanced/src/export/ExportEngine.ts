/**
 * Export Engine - Cross-LLM memory export
 * Exports facts, hypotheses, and active project to portable JSON format
 */

import { writeFileSync } from 'fs';
import { CONFIG } from '../config/defaults';
import { FactStore } from '../storage/FactStore';
import { HypothesisStore } from '../storage/HypothesisStore';
import { ProjectStore } from '../storage/ProjectStore';
import { getSourceModel, getSourceProvider, getSessionId } from './EnvVarReader';
import type { MemoryExport, ExportMetadata } from '../schema/ExportFormat';
import type { Fact } from '../schema/Fact';
import type { Hypothesis } from '../schema/Hypothesis';

export interface ExportOptions {
  minConfidence?: number;
  includeHypotheses?: boolean;
  includeProject?: boolean;
  outputPath?: string;
}

export interface ExportResult {
  export: MemoryExport;
  outputPath: string | null;
  factCount: number;
  hypothesisCount: number;
}

export class ExportEngine {
  private factStore: FactStore;
  private hypothesisStore: HypothesisStore;
  private projectStore: ProjectStore;

  constructor() {
    this.factStore = new FactStore();
    this.hypothesisStore = new HypothesisStore();
    this.projectStore = new ProjectStore();
  }

  export(options: ExportOptions = {}): ExportResult {
    const {
      minConfidence = CONFIG.defaultConfidenceThreshold,
      includeHypotheses = true,
      includeProject = true,
      outputPath,
    } = options;

    // Get facts (filter by confidence based on observation count)
    let facts = this.factStore.list(undefined, 10000);
    if (minConfidence > 0) {
      facts = facts.filter(
        (f) => (f.observationCount || 1) >= minConfidence * CONFIG.promotionThreshold
      );
    }

    // Get hypotheses (only open ones)
    let hypotheses: Hypothesis[] = [];
    if (includeHypotheses) {
      hypotheses = this.hypothesisStore.list('open');
    }

    // Get active project
    const activeProject = includeProject ? this.projectStore.getActive() : undefined;

    // Build metadata
    const metadata: ExportMetadata = {
      version: CONFIG.exportVersion,
      exportedAt: new Date().toISOString(),
      sourceModel: getSourceModel() as ExportMetadata['sourceModel'],
      sourceProvider: getSourceProvider() as ExportMetadata['sourceProvider'],
      sessionId: getSessionId(),
      factCount: facts.length,
      hypothesisCount: hypotheses.length,
      confidenceThresholdApplied: minConfidence,
    };

    // Build export object
    const exportData: MemoryExport = {
      exportMetadata: metadata,
      facts,
      hypotheses,
      activeProject: activeProject || undefined,
    };

    // Write to file if path provided
    let finalPath: string | null = null;
    if (outputPath) {
      finalPath = outputPath;
    } else {
      // Generate default path
      const dateStr = new Date().toISOString().split('T')[0];
      finalPath = `memory-export-${dateStr}.json`;
    }

    if (finalPath) {
      writeFileSync(finalPath, JSON.stringify(exportData, null, 2));
    }

    return {
      export: exportData,
      outputPath: finalPath,
      factCount: facts.length,
      hypothesisCount: hypotheses.length,
    };
  }

  exportToString(options: ExportOptions = {}): string {
    const result = this.export({ ...options, outputPath: undefined });
    return JSON.stringify(result.export, null, 2);
  }
}
