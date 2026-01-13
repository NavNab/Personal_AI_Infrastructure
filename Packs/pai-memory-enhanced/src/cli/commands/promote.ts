/**
 * Promote command - manually promote hypotheses to facts
 */

import { Command } from 'commander';
import { HypothesisStore } from '../../storage/HypothesisStore';
import { FactStore } from '../../storage/FactStore';
import { runAutoPromoter, checkPendingPromotions } from '../../lib/extractors/AutoPromoter';

export const promoteCommand = new Command('promote')
  .description('Promote hypotheses to facts')
  .argument('[index]', 'Index of hypothesis to promote (from list --open)')
  .option('-a, --auto', 'Auto-promote all hypotheses with 5+ observations')
  .option('-t, --threshold <n>', 'Custom threshold for auto-promote', '5')
  .option('-d, --dry-run', 'Show what would be promoted without doing it')
  .option('-l, --list', 'List hypotheses eligible for promotion')
  .action((index, options) => {
    const hypothesisStore = new HypothesisStore();
    const factStore = new FactStore();

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                  PAI MEMORY - PROMOTE                         ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    // List eligible hypotheses
    if (options.list) {
      const threshold = parseInt(options.threshold);
      const pending = checkPendingPromotions(threshold);

      console.log(`=== ELIGIBLE FOR PROMOTION (threshold: ${threshold}) ===`);
      console.log('');

      if (pending.count === 0) {
        console.log('  No hypotheses meet the promotion threshold.');
        console.log('');
        console.log('  Open hypotheses by observation count:');
        const open = hypothesisStore.list('open').sort((a, b) => b.observationCount - a.observationCount);
        for (let i = 0; i < Math.min(5, open.length); i++) {
          const h = open[i];
          console.log(`    [${i}] ${h.observationCount}/5 obs - ${h.statement.slice(0, 50)}...`);
        }
      } else {
        for (let i = 0; i < pending.hypotheses.length; i++) {
          const h = pending.hypotheses[i];
          console.log(`  [${i}] ${h.observationCount} obs - ${h.statement}`);
        }
        console.log('');
        console.log(`  Run "pai-memory promote --auto" to promote all ${pending.count} eligible hypotheses.`);
      }
      console.log('');
      return;
    }

    // Auto-promote
    if (options.auto) {
      const threshold = parseInt(options.threshold);
      const result = runAutoPromoter({
        threshold,
        dryRun: options.dryRun,
      });

      if (options.dryRun) {
        console.log(`=== DRY RUN (threshold: ${threshold}) ===`);
        console.log('');
        console.log(`Would promote: ${result.promoted} hypotheses`);
        console.log(`Would remain: ${result.remaining} hypotheses`);
      } else {
        console.log(`=== AUTO-PROMOTE (threshold: ${threshold}) ===`);
        console.log('');
        console.log(`Promoted: ${result.promoted} hypotheses`);
        console.log(`Remaining: ${result.remaining} hypotheses`);
      }

      if (result.details.length > 0) {
        console.log('');
        console.log('Details:');
        for (const d of result.details) {
          const action = options.dryRun ? 'Would promote' : 'Promoted';
          console.log(`  ${action}: ${d.key}`);
          console.log(`    ${d.statement}`);
          console.log('');
        }
      }
      return;
    }

    // Manual promote by index
    if (index !== undefined) {
      const idx = parseInt(index);
      const open = hypothesisStore.list('open').sort((a, b) => b.observationCount - a.observationCount);

      if (idx < 0 || idx >= open.length) {
        console.log(`Error: Invalid index ${idx}. Valid range: 0-${open.length - 1}`);
        console.log('');
        console.log('Use "pai-memory promote --list" to see available hypotheses.');
        return;
      }

      const hypothesis = open[idx];

      if (options.dryRun) {
        console.log('=== DRY RUN ===');
        console.log('');
        console.log(`Would promote: ${hypothesis.statement}`);
        console.log(`Observations: ${hypothesis.observationCount}`);
        return;
      }

      // Generate fact key
      const key = hypothesis.statement
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .slice(0, 4)
        .join('_');

      // Add to facts
      const fact = factStore.add(
        `manual.${key}`,
        hypothesis.statement,
        hypothesis.tags,
        hypothesis.observationCount >= 5 ? 'high' : 'medium'
      );

      // Mark hypothesis as validated
      hypothesisStore.updateStatus(hypothesis.timestamp, 'validated');

      console.log('=== MANUAL PROMOTION ===');
      console.log('');
      console.log(`✅ Promoted hypothesis to fact`);
      console.log('');
      console.log(`  Key: ${fact.key}`);
      console.log(`  Value: ${fact.value}`);
      console.log(`  Importance: ${fact.importance}`);
      console.log(`  Observations: ${hypothesis.observationCount}`);
      console.log('');
      return;
    }

    // No arguments - show help
    console.log('Usage:');
    console.log('');
    console.log('  pai-memory promote --list              List eligible hypotheses');
    console.log('  pai-memory promote --auto              Auto-promote (5+ obs)');
    console.log('  pai-memory promote --auto -t 3        Auto-promote (3+ obs)');
    console.log('  pai-memory promote 0                   Manually promote index 0');
    console.log('  pai-memory promote --dry-run --auto   Preview what would happen');
    console.log('');
  });
