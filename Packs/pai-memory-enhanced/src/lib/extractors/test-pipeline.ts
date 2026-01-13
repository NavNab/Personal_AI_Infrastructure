#!/usr/bin/env bun
/**
 * Integration Test - Learning Extraction Pipeline
 *
 * Tests the full pipeline:
 * 1. TranscriptReader - Parse JSONL
 * 2. SignalSampler - Sample messages
 * 3. LearningExtractor - Extract learnings
 *
 * Usage:
 *   bun run test-pipeline.ts [transcript_path]
 */

import {
  readTranscript,
  formatConversation,
} from './TranscriptReader';
import {
  sampleMessages,
  getSamplingStats,
} from './SignalSampler';
import {
  extractLearnings,
  checkOllamaAvailable,
  checkModelAvailable,
} from './LearningExtractor';

const DEFAULT_TRANSCRIPT = '/Users/nabil.bamoh/.claude/projects/-Users-nabil-bamoh-dotfiles/23e00ce1-a50f-46e3-84ea-ad6d6adcc0d4.jsonl';

async function main() {
  const transcriptPath = process.argv[2] || DEFAULT_TRANSCRIPT;

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     LEARNING EXTRACTION PIPELINE - INTEGRATION TEST           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Step 0: Check prerequisites
  console.log('=== PREREQUISITES ===\n');

  const ollamaAvailable = await checkOllamaAvailable();
  console.log(`Ollama installed: ${ollamaAvailable ? '✅' : '❌'}`);

  if (!ollamaAvailable) {
    console.error('\n❌ Ollama is not installed. Please install Ollama first.');
    process.exit(1);
  }

  const modelAvailable = await checkModelAvailable();
  console.log(`qwen3:4b model: ${modelAvailable ? '✅' : '❌'}`);

  if (!modelAvailable) {
    console.log('\n⚠️ qwen3:4b not found. Installing...');
    const { $ } = await import('bun');
    await $`ollama pull qwen3:4b`;
  }

  console.log('\n=== STEP 1: TRANSCRIPT READER ===\n');
  console.log(`File: ${transcriptPath}\n`);

  try {
    const transcript = readTranscript(transcriptPath);

    console.log(`Session ID: ${transcript.sessionId.slice(0, 8)}...`);
    console.log(`Raw size: ${(transcript.rawSize / 1024).toFixed(1)} KB`);
    console.log(`Raw lines: ${transcript.rawLines}`);
    console.log(`Extracted messages: ${transcript.messages.length}`);
    console.log(`Extracted tokens: ${transcript.totalTokens.toLocaleString()}`);
    console.log(`Reduction: ${transcript.reductionPercent}%`);

    console.log('\n=== STEP 2: SIGNAL SAMPLER ===\n');

    const sampled = sampleMessages(transcript.messages, {
      maxTokens: 18000,
    });

    const stats = getSamplingStats(transcript.messages, sampled);

    console.log(`Messages with signals: ${stats.messagesWithSignals}/${stats.totalMessages} (${(stats.messagesWithSignals / stats.totalMessages * 100).toFixed(1)}%)`);
    console.log(`Signal breakdown:`);
    console.log(`  - preference: ${stats.signalCounts.preference}`);
    console.log(`  - decision: ${stats.signalCounts.decision}`);
    console.log(`  - correction: ${stats.signalCounts.correction}`);
    console.log(`Sampled: ${stats.sampledMessages} messages, ${stats.sampledTokens.toLocaleString()} tokens`);

    console.log('\n=== STEP 3: FORMAT CONVERSATION ===\n');

    const conversation = formatConversation(sampled, {
      maxMessageLength: 500,
    });

    console.log(`Formatted conversation: ${conversation.length} chars`);
    console.log(`Preview (first 500 chars):\n`);
    console.log('---');
    console.log(conversation.slice(0, 500) + '...');
    console.log('---');

    console.log('\n=== STEP 4: LEARNING EXTRACTOR ===\n');
    console.log('Calling qwen3:4b... (this may take 15-30 seconds)\n');

    const result = await extractLearnings(conversation, { timeout: 90000 });

    console.log(`Success: ${result.success ? '✅' : '❌'}`);
    console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);

    if (!result.success) {
      console.log(`Error: ${result.error}`);
      if (result.rawOutput) {
        console.log(`\nRaw output preview:\n${result.rawOutput.slice(0, 500)}...`);
      }
    } else {
      console.log(`Learnings extracted: ${result.learnings.length}`);
      console.log(`\nSession summary: ${result.sessionSummary}\n`);

      console.log('=== EXTRACTED LEARNINGS ===\n');

      for (const learning of result.learnings) {
        console.log(`[${learning.category}] (${learning.confidence.toFixed(1)})`);
        console.log(`  ${learning.statement}`);
        if (learning.evidence) {
          console.log(`  Evidence: "${learning.evidence.slice(0, 80)}${learning.evidence.length > 80 ? '...' : ''}"`);
        }
        console.log();
      }
    }

    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST COMPLETE                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('Pipeline error:', error);
    process.exit(1);
  }
}

main();
