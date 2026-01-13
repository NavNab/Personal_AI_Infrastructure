/**
 * sessions command - List all arena sessions
 */

import { Command } from 'commander';
import { SessionManager } from '../../core/Session';

export const sessionsCommand = new Command('sessions')
  .description('List all arena sessions')
  .option('-s, --status <status>', 'Filter by status (running, paused, completed, failed)')
  .option('-l, --limit <limit>', 'Limit number of results', '10')
  .action((options) => {
    const manager = new SessionManager();
    let sessions = manager.listSessions();

    // Filter by status
    if (options.status) {
      sessions = sessions.filter((s) => s.status === options.status);
    }

    // Limit
    const limit = parseInt(options.limit);
    sessions = sessions.slice(0, limit);

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                   PAI ARENA - SESSIONS                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    if (sessions.length === 0) {
      console.log('No sessions found.');
      console.log('');
      console.log('Start a new session with:');
      console.log('  pai-arena start --mission "..." --doers architect,backend');
      console.log('');
      return;
    }

    for (const session of sessions) {
      const statusIcon =
        session.status === 'running' ? '🟢' :
        session.status === 'paused' ? '🟡' :
        session.status === 'completed' ? '✅' : '🔴';

      console.log(`${statusIcon} ${session.id.slice(0, 8)}  [${session.status}]`);
      console.log(`   Mission: ${session.mission.slice(0, 50)}${session.mission.length > 50 ? '...' : ''}`);
      console.log(`   DOERs: ${session.doers.join(', ')}`);
      console.log(`   Turns: ${session.turnsUsed}/${session.budget}`);
      console.log(`   Updated: ${new Date(session.updatedAt).toLocaleString()}`);
      console.log('');
    }
  });
