/**
 * run command - Run arena session in headless mode
 */

import { Command } from 'commander';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { SessionManager } from '../../core/Session';
import { Router, RouterEvents, RoutedMessage } from '../../core/Router';
import { DirectorDecision } from '../../core/Director';

export const runCommand = new Command('run')
  .description('Run arena session in headless mode (for CI/automation)')
  .requiredOption('-m, --mission <mission>', 'Mission description')
  .requiredOption('-d, --doers <doers>', 'Comma-separated list of DOER types')
  .option('-b, --budget <budget>', 'Turn budget (default: 100)', '100')
  .option('-o, --output <dir>', 'Output directory for artifacts', './arena-output')
  .option('-v, --verbose', 'Show detailed agent messages')
  .action(async (options) => {
    const doerTypes = options.doers.split(',').map((d: string) => d.trim());
    const budget = parseInt(options.budget);
    const outputDir = options.output;
    const verbose = options.verbose || false;

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

    // Create output directory
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const manager = new SessionManager();
    const state = manager.start(options.mission, doerTypes, budget);

    console.log(`Session started: ${state.session.id}`);
    console.log('');
    console.log('─'.repeat(65));
    console.log('');

    // Track completion
    let isComplete = false;
    let completionReason = '';

    // Create event handlers for headless mode
    const events: RouterEvents = {
      onMessage: (msg: RoutedMessage) => {
        const timestamp = new Date(msg.timestamp).toLocaleTimeString();
        const arrow = msg.from === 'director' ? '→' : '←';
        const preview = msg.content.slice(0, 150).replace(/\n/g, ' ');

        console.log(`[${timestamp}] ${msg.from} ${arrow} ${msg.to}`);
        if (verbose) {
          console.log(msg.content);
          console.log('');
        } else {
          console.log(`  ${preview}${msg.content.length > 150 ? '...' : ''}`);
        }
        console.log('');
      },

      onAgentStateChange: (agentId: string, status: string) => {
        if (verbose) {
          console.log(`[STATE] ${agentId}: ${status}`);
        }
      },

      onDecision: (decision: DirectorDecision) => {
        console.log(`[DECISION] ${decision.type}${decision.targetDoer ? ` → ${decision.targetDoer}` : ''}`);
        if (verbose && decision.reasoning) {
          console.log(`  Reasoning: ${decision.reasoning.slice(0, 100)}...`);
        }
        console.log('');
      },

      onComplete: (reason: string) => {
        isComplete = true;
        completionReason = reason;
        console.log('');
        console.log('─'.repeat(65));
        console.log(`✅ Mission complete: ${reason}`);
        console.log('');
      },

      onError: (error: string) => {
        console.error(`[ERROR] ${error}`);
      },
    };

    // Create and initialize router
    const router = new Router(manager, events);

    try {
      router.initialize();
      console.log('Agents initialized. Starting orchestration...');
      console.log('');

      // Start the orchestration loop
      await router.start();

      // Wait for completion (router.start() is async and triggers the loop)
      // The loop continues via recursive calls in sendToDirector/sendToDoer
      // We wait here by polling until complete or timeout
      const maxWaitMs = 30 * 60 * 1000; // 30 minutes max
      const startTime = Date.now();

      while (!isComplete && router.isActive()) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check for timeout
        if (Date.now() - startTime > maxWaitMs) {
          console.log('');
          console.log('⚠️  Timeout reached (30 minutes). Stopping...');
          router.stop();
          manager.complete('failed');
          break;
        }
      }

      // Mark session complete
      if (isComplete) {
        manager.complete('completed');
      }

    } catch (error) {
      console.error('Arena execution failed:', error);
      manager.complete('failed');
    }

    // Export transcript
    const markdown = manager.export();
    writeFileSync(join(outputDir, 'transcript.md'), markdown);
    console.log(`Transcript exported to: ${join(outputDir, 'transcript.md')}`);
    console.log('');

    // Show summary
    const finalState = manager.getState();
    if (finalState) {
      console.log('Budget usage:');
      for (const [id, agent] of finalState.agents) {
        const pct = Math.round((agent.turnsUsed / agent.turnsAllocated) * 100);
        console.log(`  ${id}: ${agent.turnsUsed}/${agent.turnsAllocated} turns (${pct}%)`);
      }
      console.log('');
    }
  });
