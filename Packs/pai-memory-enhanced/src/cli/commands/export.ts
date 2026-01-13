/**
 * Export command - export memory to JSON file
 */

import { Command } from 'commander';
import { ExportEngine } from '../../export/ExportEngine';

export const exportCommand = new Command('export')
  .description('Export memory to JSON file')
  .option('-o, --output <path>', 'Output file path')
  .option('-c, --min-confidence <n>', 'Minimum confidence threshold', '1.0')
  .option('--no-hypotheses', 'Exclude hypotheses')
  .option('--no-project', 'Exclude active project')
  .option('--stdout', 'Output to stdout instead of file')
  .action((options) => {
    const engine = new ExportEngine();

    if (options.stdout) {
      const json = engine.exportToString({
        minConfidence: parseFloat(options.minConfidence),
        includeHypotheses: options.hypotheses !== false,
        includeProject: options.project !== false,
      });
      console.log(json);
    } else {
      const result = engine.export({
        outputPath: options.output,
        minConfidence: parseFloat(options.minConfidence),
        includeHypotheses: options.hypotheses !== false,
        includeProject: options.project !== false,
      });

      console.log(`\n✓ Memory exported`);
      console.log(`  Facts: ${result.factCount}`);
      console.log(`  Hypotheses: ${result.hypothesisCount}`);
      console.log(`  Output: ${result.outputPath}`);
    }
  });
