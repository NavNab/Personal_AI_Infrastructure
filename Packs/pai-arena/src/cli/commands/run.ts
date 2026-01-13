/**
 * run command - Run arena session in headless mode
 */

import { Command } from 'commander';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { SessionManager } from '../../core/Session';

export const runCommand = new Command('run')
  .description('Run arena session in headless mode (for CI/automation)')
  .requiredOption('-m, --mission <mission>', 'Mission description')
  .requiredOption('-d, --doers <doers>', 'Comma-separated list of DOER types')
  .option('-b, --budget <budget>', 'Turn budget (default: 100)', '100')
  .option('-o, --output <dir>', 'Output directory for artifacts', './arena-output')
  .action(async (options) => {
    const doerTypes = options.doers.split(',').map((d: string) => d.trim());
    const budget = parseInt(options.budget);
    const outputDir = options.output;

    // Validate DOER types
    const validDoers = ['architect', 'backend', 'frontend', 'qa', 'security', 'docs', 'researcher', 'refactorer'];
    for (const doer of doerTypes) {
      if (!validDoers.includes(doer)) {
        console.error(`Invalid DOER type: ${doer}`);
        process.exit(1);
      }
    }

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                PAI ARENA - HEADLESS RUN                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Mission: ${options.mission}`);
    console.log(`DOERs: ${doerTypes.join(', ')}`);
    console.log(`Budget: ${budget} turns`);
    console.log(`Output: ${outputDir}`);
    console.log('');

    const manager = new SessionManager();
    const state = manager.start(options.mission, doerTypes, budget);

    console.log(`Session started: ${state.session.id}`);
    console.log('');

    // TODO: Run the actual orchestration loop
    // This will be implemented when Director and Router are ready
    console.log('⚠️  Headless execution not yet implemented.');
    console.log('   Use web UI for interactive sessions:');
    console.log(`   pai-arena serve --session ${state.session.id}`);
    console.log('');

    // Create output directory
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Export transcript
    const markdown = manager.export();
    writeFileSync(join(outputDir, 'transcript.md'), markdown);
    console.log(`Transcript exported to: ${join(outputDir, 'transcript.md')}`);
    console.log('');
  });
