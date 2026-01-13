/**
 * start command - Start a new arena session
 */

import { Command } from 'commander';
import { SessionManager } from '../../core/Session';

export const startCommand = new Command('start')
  .description('Start a new arena session')
  .requiredOption('-m, --mission <mission>', 'Mission description')
  .requiredOption('-d, --doers <doers>', 'Comma-separated list of DOER types (architect,backend,frontend,qa,security,docs,researcher,refactorer)')
  .option('-b, --budget <budget>', 'Turn budget (default: 1000)', '1000')
  .option('--web', 'Open web UI after starting')
  .action(async (options) => {
    const doerTypes = options.doers.split(',').map((d: string) => d.trim());
    const budget = parseInt(options.budget);

    // Validate DOER types
    const validDoers = ['architect', 'backend', 'frontend', 'qa', 'security', 'docs', 'researcher', 'refactorer'];
    for (const doer of doerTypes) {
      if (!validDoers.includes(doer)) {
        console.error(`Invalid DOER type: ${doer}`);
        console.error(`Valid types: ${validDoers.join(', ')}`);
        process.exit(1);
      }
    }

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    PAI ARENA - START                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    const manager = new SessionManager();
    const state = manager.start(options.mission, doerTypes, budget);

    console.log(`Session ID: ${state.session.id}`);
    console.log(`Mission: ${state.session.mission}`);
    console.log(`DOERs: ${doerTypes.join(', ')}`);
    console.log(`Budget: ${budget} turns`);
    console.log('');
    console.log('Agents initialized:');
    for (const [id, agent] of state.agents) {
      const typeInfo = agent.doerType ? ` (${agent.doerType})` : '';
      console.log(`  - ${id}${typeInfo}: ${agent.turnsAllocated} turns allocated`);
    }
    console.log('');

    if (options.web) {
      console.log('Starting web UI...');
      // TODO: Launch web server
    } else {
      console.log(`Resume with: pai-arena resume ${state.session.id}`);
      console.log(`Web UI: pai-arena serve --session ${state.session.id}`);
    }
    console.log('');
  });
