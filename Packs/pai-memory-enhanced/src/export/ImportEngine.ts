/**
 * Import Engine - Cross-LLM memory import
 * Imports facts, hypotheses from portable JSON format
 */

import { readFileSync, existsSync } from 'fs';
import { CONFIG } from '../config/defaults';
import { FactStore } from '../storage/FactStore';
import { HypothesisStore } from '../storage/HypothesisStore';
import { ProjectStore } from '../storage/ProjectStore';
import { EpisodeStore } from '../storage/EpisodeStore';
import type { MemoryExport } from '../schema/ExportFormat';
import type { Fact } from '../schema/Fact';
import type { Hypothesis } from '../schema/Hypothesis';

export interface ImportOptions {
  importFacts?: boolean;
  importHypotheses?: boolean;
  importProject?: boolean;
  trustLevel?: number; // Initial confidence multiplier (0-1)
}

export interface ImportResult {
  success: boolean;
  factsImported: number;
  hypothesesImported: number;
  projectImported: boolean;
  errors: string[];
  sourceModel: string;
}

export class ImportEngine {
  private factStore: FactStore;
  private hypothesisStore: HypothesisStore;
  private projectStore: ProjectStore;
  private episodeStore: EpisodeStore;

  constructor() {
    this.factStore = new FactStore();
    this.hypothesisStore = new HypothesisStore();
    this.projectStore = new ProjectStore();
    this.episodeStore = new EpisodeStore();
  }

  importFromFile(filePath: string, options: ImportOptions = {}): ImportResult {
    const errors: string[] = [];

    // Check file exists
    if (!existsSync(filePath)) {
      return {
        success: false,
        factsImported: 0,
        hypothesesImported: 0,
        projectImported: false,
        errors: [`File not found: ${filePath}`],
        sourceModel: 'unknown',
      };
    }

    // Read and parse file
    let exportData: MemoryExport;
    try {
      const content = readFileSync(filePath, 'utf-8');
      exportData = JSON.parse(content) as MemoryExport;
    } catch (e) {
      return {
        success: false,
        factsImported: 0,
        hypothesesImported: 0,
        projectImported: false,
        errors: [`Failed to parse file: ${e}`],
        sourceModel: 'unknown',
      };
    }

    return this.importFromData(exportData, options);
  }

  importFromData(exportData: MemoryExport, options: ImportOptions = {}): ImportResult {
    const {
      importFacts = true,
      importHypotheses = true,
      importProject = true,
      trustLevel = 0.5,
    } = options;

    const errors: string[] = [];
    let factsImported = 0;
    let hypothesesImported = 0;
    let projectImported = false;

    const sourceModel = exportData.exportMetadata?.sourceModel || 'unknown';

    // Validate version
    const version = exportData.exportMetadata?.version;
    if (version && !version.startsWith('2.')) {
      errors.push(`Warning: Import version ${version} may not be fully compatible`);
    }

    // Import facts
    if (importFacts && exportData.facts) {
      for (const fact of exportData.facts) {
        try {
          // Add with reduced observation count based on trust level
          const adjustedCount = Math.max(
            1,
            Math.floor((fact.observationCount || 1) * trustLevel)
          );
          this.factStore.add(
            fact.key,
            fact.value,
            [...(fact.tags || []), `imported:${sourceModel}`],
            fact.importance || 'medium'
          );
          factsImported++;
        } catch (e) {
          errors.push(`Failed to import fact ${fact.key}: ${e}`);
        }
      }
    }

    // Import hypotheses
    if (importHypotheses && exportData.hypotheses) {
      for (const hyp of exportData.hypotheses) {
        try {
          if (hyp.status === 'open') {
            this.hypothesisStore.add(
              hyp.statement,
              CONFIG.defaultExpiryDays,
              hyp.cues || [],
              [...(hyp.tags || []), `imported:${sourceModel}`]
            );
            hypothesesImported++;
          }
        } catch (e) {
          errors.push(`Failed to import hypothesis: ${e}`);
        }
      }
    }

    // Import project
    if (importProject && exportData.activeProject) {
      try {
        const project = exportData.activeProject;
        this.projectStore.save({
          ...project,
          slug: `imported-${project.slug}`,
          active: false, // Don't auto-activate imported projects
        });
        projectImported = true;
      } catch (e) {
        errors.push(`Failed to import project: ${e}`);
      }
    }

    // Log import event
    this.episodeStore.log('memory_import', {
      sourceModel,
      factsImported,
      hypothesesImported,
      projectImported,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      factsImported,
      hypothesesImported,
      projectImported,
      errors,
      sourceModel,
    };
  }
}
