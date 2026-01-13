#!/usr/bin/env bun
/**
 * /pai-memory skill - Record observations to PAI Memory Enhanced
 *
 * Usage: bun run pai-memory.ts "observation text"
 * Usage: bun run pai-memory.ts --list
 * Usage: bun run pai-memory.ts --fact "domain.key" "value"
 */

import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';

const PAI_DIR = process.env.PAI_DIR || join(homedir(), '.claude');
const CLI_PATH = join(PAI_DIR, 'skills', 'MemoryEnhanced', 'cli', 'cli.ts');

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
/pai-memory - Record observations to PAI Memory

Usage:
  /pai-memory "observation"     Record a hypothesis
  /pai-memory --list            List current hypotheses
  /pai-memory --facts           List validated facts
  /pai-memory --fact key value  Record a validated fact directly

Examples:
  /pai-memory "User prefers dark mode"
  /pai-memory "Project uses TypeScript"
  /pai-memory --fact user.timezone "PST"
`);
    return;
  }

  // Route to appropriate CLI command
  let cliArgs: string[] = [];

  if (args[0] === '--list') {
    cliArgs = ['hypothesis', '--list'];
  } else if (args[0] === '--facts') {
    cliArgs = ['fact', '--list'];
  } else if (args[0] === '--fact' && args.length >= 3) {
    cliArgs = ['fact', args[1], args.slice(2).join(' ')];
  } else {
    // Default: record as hypothesis
    cliArgs = ['hypothesis', args.join(' ')];
  }

  const result = spawnSync('bun', ['run', CLI_PATH, ...cliArgs], {
    stdio: 'inherit',
    env: { ...process.env, PAI_DIR },
  });

  if (result.error) {
    console.error('Failed to execute memory command:', result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

main();
