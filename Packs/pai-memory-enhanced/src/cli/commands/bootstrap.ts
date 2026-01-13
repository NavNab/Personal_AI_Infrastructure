/**
 * Bootstrap command - show bootstrap slice
 */

import { Command } from 'commander';
import { sessionStartHook, formatBootstrapSummary } from '../../hooks/SessionStart.hook';

export const bootstrapCommand = new Command('bootstrap')
  .description('Show bootstrap slice (session context)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const result = await sessionStartHook();

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n' + formatBootstrapSummary(result));
    }
  });
