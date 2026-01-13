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
import { synthesizeCommand } from './commands/synthesize';
import { listCommand } from './commands/list';
import { statsCommand } from './commands/stats';
import { promoteCommand } from './commands/promote';
import { searchCommand } from './commands/search';
import { semanticCommand } from './commands/semantic';

const program = new Command();

program
  .name('pai-memory')
  .description('PAI Memory Enhanced - Cross-LLM memory system with validation')
  .version('3.0.0');

// Primary commands (most used)
program.addCommand(listCommand);
program.addCommand(statsCommand);
program.addCommand(searchCommand);
program.addCommand(semanticCommand);
program.addCommand(promoteCommand);

// Management commands
program.addCommand(factCommand);
program.addCommand(hypothesisCommand);
program.addCommand(sweepCommand);

// Import/Export
program.addCommand(exportCommand);
program.addCommand(importCommand);

// Advanced
program.addCommand(bootstrapCommand);
program.addCommand(cuesCommand);
program.addCommand(synthesizeCommand);

program.parse();
