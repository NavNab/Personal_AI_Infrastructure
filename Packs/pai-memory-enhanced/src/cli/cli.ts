#!/usr/bin/env bun
/**
 * PAI Memory Enhanced CLI
 * Command-line interface for memory management
 */

import { Command } from 'commander';
import { factCommand } from './commands/fact';
import { hypothesisCommand } from './commands/hypothesis';
import { sweepCommand } from './commands/sweep';
import { exportCommand } from './commands/export';
import { importCommand } from './commands/import';
import { bootstrapCommand } from './commands/bootstrap';
import { cuesCommand } from './commands/cues';

const program = new Command();

program
  .name('pai-memory')
  .description('PAI Memory Enhanced - Cross-LLM memory system with validation')
  .version('2.0.0');

// Register commands
program.addCommand(factCommand);
program.addCommand(hypothesisCommand);
program.addCommand(sweepCommand);
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(bootstrapCommand);
program.addCommand(cuesCommand);

program.parse();
