/**
 * resume command - Resume an existing arena session
 */

import { Command } from 'commander';
import { SessionManager } from '../../core/Session';

export const resumeCommand = new Command('resume')
  .description('Resume an existing arena session')
  .argument('<session-id>', 'Session ID to resume')
  .option('--web', 'Open web UI after resuming')
  .action(async (sessionId, options) => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                   PAI ARENA - RESUME                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    const manager = new SessionManager();
    const state = manager.resume(sessionId);

    if (!state) {
      console.error(`Session not found or already completed: ${sessionId}`);
      process.exit(1);
    }

    console.log(`Session ID: ${state.session.id}`);
    console.log(`Mission: ${state.session.mission}`);
    console.log(`Status: ${state.session.status}`);
    console.log(`Progress: ${state.currentTurn}/${state.session.budget} turns`);
    console.log('');
    console.log('Agents:');
    for (const [id, agent] of state.agents) {
      const typeInfo = agent.doerType ? ` (${agent.doerType})` : '';
      console.log(`  - ${id}${typeInfo}: ${agent.turnsUsed}/${agent.turnsAllocated} turns used`);
    }
    console.log('');

    if (options.web) {
      console.log('Starting web UI...');
      // TODO: Launch web server with session
    } else {
      console.log('Session resumed. Use web UI to continue:');
      console.log(`  pai-arena serve --session ${state.session.id}`);
    }
    console.log('');
  });
