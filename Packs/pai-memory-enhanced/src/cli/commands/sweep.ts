/**
 * Sweep command - run hypothesis sweep
 */

import { Command } from 'commander';
import { dailyValidationHook, formatValidationSummary } from '../../hooks/DailyValidation.hook';
import { HypothesisSweeper } from '../../validation/HypothesisSweeper';

export const sweepCommand = new Command('sweep')
  .description('Sweep expired hypotheses and promote confident ones')
  .option('--dry-run', 'Show what would be done without doing it')
  .action(async (options) => {
    if (options.dryRun) {
      console.log('\n[DRY RUN] Analyzing hypotheses...\n');
      const sweeper = new HypothesisSweeper();
      const summary = sweeper.getSummary();
      console.log('=== Sweep Preview ===');
      console.log(`Total hypotheses: ${summary.total}`);
      console.log(`Open hypotheses: ${summary.open}`);
      console.log(`Expiring soon (2 days): ${summary.expiringSoon}`);
      console.log(`Ready for promotion: ${summary.readyForPromotion}`);
      return;
    }

    console.log('\nRunning sweep...\n');
    const result = await dailyValidationHook();
    console.log(formatValidationSummary(result));
  });
