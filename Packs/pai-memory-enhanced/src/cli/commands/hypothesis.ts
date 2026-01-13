/**
 * Hypothesis command - add and list hypotheses
 */

import { Command } from 'commander';
import { HypothesisStore } from '../../storage/HypothesisStore';
import { calculateFrequencyConfidence, formatConfidence } from '../../validation/FrequencyConfidenceCalculator';

export const hypothesisCommand = new Command('hypothesis')
  .description('Manage hypotheses')
  .argument('[statement]', 'Hypothesis statement')
  .option('-e, --expiry <days>', 'Days until expiry', '7')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-l, --list', 'List all hypotheses')
  .option('-s, --status <status>', 'Filter by status: open, promoted, expired, closed')
  .option('--limit <n>', 'Limit results', '20')
  .action((statement, options) => {
    const store = new HypothesisStore();

    if (options.list) {
      // List hypotheses
      const status = options.status as 'open' | 'promoted' | 'expired' | 'closed' | undefined;
      const hypotheses = store.list(status).slice(0, parseInt(options.limit));
      console.log(`\n=== Hypotheses (${hypotheses.length}) ===\n`);

      for (const h of hypotheses) {
        const confidence = calculateFrequencyConfidence(h);
        const bar = formatConfidence(confidence);
        console.log(`[${h.status}] ${h.statement}`);
        console.log(`  Confidence: ${bar}`);
        console.log(`  Expires: day ${h.expiresOrdinal} | Tags: ${h.tags.join(', ') || 'none'}`);
        console.log('');
      }
    } else if (statement) {
      // Add hypothesis
      const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [];
      const h = store.add(statement, parseInt(options.expiry), [], tags);
      const confidence = calculateFrequencyConfidence(h);

      console.log(`\n✓ Hypothesis ${h.observationCount > 1 ? 'reinforced' : 'added'}`);
      console.log(`  Statement: ${h.statement}`);
      console.log(`  Observations: ${h.observationCount}`);
      console.log(`  Confidence: ${formatConfidence(confidence)}`);
      console.log(`  Expires: day ${h.expiresOrdinal}`);
    } else {
      console.log('Usage: pai-memory hypothesis "<statement>" [options]');
      console.log('       pai-memory hypothesis --list');
    }
  });
