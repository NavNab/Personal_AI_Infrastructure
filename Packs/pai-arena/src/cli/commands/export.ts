/**
 * export command - Export session to markdown
 */

import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { SessionManager } from '../../core/Session';

export const exportCommand = new Command('export')
  .description('Export session to markdown')
  .argument('<session-id>', 'Session ID to export')
  .option('-o, --output <path>', 'Output file path')
  .action((sessionId, options) => {
    const manager = new SessionManager();
    const state = manager.resume(sessionId);

    if (!state) {
      console.error(`Session not found: ${sessionId}`);
      process.exit(1);
    }

    const markdown = manager.export();

    if (options.output) {
      writeFileSync(options.output, markdown);
      console.log(`Exported to: ${options.output}`);
    } else {
      console.log(markdown);
    }
  });
