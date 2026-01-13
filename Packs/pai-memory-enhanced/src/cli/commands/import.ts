/**
 * Import command - import memory from JSON file
 */

import { Command } from 'commander';
import { ImportEngine } from '../../export/ImportEngine';
import { validateExportFormat } from '../../export/FormatValidator';
import { readFileSync } from 'fs';

export const importCommand = new Command('import')
  .description('Import memory from JSON file')
  .argument('<file>', 'JSON file to import')
  .option('--trust <level>', 'Trust level 0-1 (affects confidence)', '0.5')
  .option('--no-facts', 'Skip importing facts')
  .option('--no-hypotheses', 'Skip importing hypotheses')
  .option('--no-project', 'Skip importing project')
  .option('--validate-only', 'Only validate, do not import')
  .action((file, options) => {
    // Validate first
    try {
      const content = readFileSync(file, 'utf-8');
      const data = JSON.parse(content);
      const validation = validateExportFormat(data);

      if (options.validateOnly) {
        console.log('\n=== Validation Result ===');
        console.log(`Valid: ${validation.valid ? 'Yes' : 'No'}`);
        if (validation.errors.length) {
          console.log('\nErrors:');
          validation.errors.forEach(e => console.log(`  - ${e}`));
        }
        if (validation.warnings.length) {
          console.log('\nWarnings:');
          validation.warnings.forEach(w => console.log(`  - ${w}`));
        }
        return;
      }

      if (!validation.valid) {
        console.error('\n✗ Invalid export format:');
        validation.errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
      }
    } catch (e) {
      console.error(`\n✗ Failed to read file: ${e}`);
      process.exit(1);
    }

    // Import
    const engine = new ImportEngine();
    const result = engine.importFromFile(file, {
      trustLevel: parseFloat(options.trust),
      importFacts: options.facts !== false,
      importHypotheses: options.hypotheses !== false,
      importProject: options.project !== false,
    });

    console.log(`\n${result.success ? '✓' : '✗'} Import ${result.success ? 'complete' : 'completed with errors'}`);
    console.log(`  Source: ${result.sourceModel}`);
    console.log(`  Facts imported: ${result.factsImported}`);
    console.log(`  Hypotheses imported: ${result.hypothesesImported}`);
    console.log(`  Project imported: ${result.projectImported ? 'Yes' : 'No'}`);

    if (result.errors.length) {
      console.log('\nErrors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }
  });
