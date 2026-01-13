/**
 * Cues command - manage cue triggers
 */

import { Command } from 'commander';
import { CueMatcher } from '../../validation/CueMatcher';

export const cuesCommand = new Command('cues')
  .description('Manage cue triggers')
  .option('-l, --list', 'List all cues')
  .option('--match', 'Show cues matching current context')
  .action((options) => {
    const matcher = new CueMatcher();
    const cues = matcher.loadCues();

    if (options.match) {
      const context = {
        cwd: process.cwd(),
        command: process.argv.join(' '),
      };
      const matches = matcher.match(context);
      console.log(`\n=== Matching Cues (${matches.length}) ===`);
      console.log(`Context: ${context.cwd}`);
      matches.forEach((result, i) => {
        console.log(`\n${i + 1}. ${JSON.stringify(result.action)}`);
        console.log(`   Matched triggers: ${result.matchedTriggers.join(', ')}`);
      });
    } else {
      console.log(`\n=== Cues (${cues.length}) ===\n`);
      cues.forEach((cue, i) => {
        console.log(`${i + 1}. Triggers: ${JSON.stringify(cue.triggers)}`);
        console.log(`   Action: ${JSON.stringify(cue.action)}`);
        console.log(`   Enabled: ${cue.enabled !== false}`);
        console.log('');
      });
    }
  });
