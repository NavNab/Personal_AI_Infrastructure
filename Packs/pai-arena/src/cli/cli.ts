#!/usr/bin/env bun
/**
 * PAI Arena CLI
 *
 * Multi-agent orchestration with 1 DIRECTOR + N DOERs
 */

import { Command } from 'commander';
import { startCommand } from './commands/start';
import { sessionsCommand } from './commands/sessions';
import { exportCommand } from './commands/export';
import { resumeCommand } from './commands/resume';
import { runCommand } from './commands/run';

const program = new Command();

program
  .name('pai-arena')
  .description('Multi-agent orchestration with 1 DIRECTOR + N DOERs')
  .version('1.0.0');

// Primary commands
program.addCommand(startCommand);
program.addCommand(resumeCommand);
program.addCommand(runCommand);

// Management commands
program.addCommand(sessionsCommand);
program.addCommand(exportCommand);

program.parse();
