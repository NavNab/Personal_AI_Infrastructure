/**
 * Format Validator - validate export/import format
 */

import { CONFIG } from '../config/defaults';
import type { MemoryExport, ExportMetadata } from '../schema/ExportFormat';

export interface ExportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateExportFormat(data: unknown): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid export data: not an object'], warnings: [] };
  }

  const exportData = data as Record<string, unknown>;

  // Check metadata
  if (!exportData.exportMetadata) {
    errors.push('Missing exportMetadata');
  } else {
    const meta = exportData.exportMetadata as Record<string, unknown>;

    if (!meta.version) {
      errors.push('Missing exportMetadata.version');
    } else if (typeof meta.version === 'string' && !meta.version.startsWith('2.')) {
      warnings.push(`Version ${meta.version} may not be fully compatible`);
    }

    if (!meta.exportedAt) {
      errors.push('Missing exportMetadata.exportedAt');
    }

    if (typeof meta.factCount !== 'number') {
      warnings.push('Missing or invalid factCount');
    }
  }

  // Check facts array
  if (!Array.isArray(exportData.facts)) {
    errors.push('Missing or invalid facts array');
  } else {
    for (let i = 0; i < exportData.facts.length; i++) {
      const fact = exportData.facts[i] as Record<string, unknown>;
      if (!fact.key || !fact.value) {
        errors.push(`Fact at index ${i} missing key or value`);
      }
    }
  }

  // Check hypotheses (optional)
  if (exportData.hypotheses && !Array.isArray(exportData.hypotheses)) {
    errors.push('Invalid hypotheses: not an array');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Re-export from ExportFormat for convenience
export { isCompatibleVersion } from '../schema/ExportFormat';
