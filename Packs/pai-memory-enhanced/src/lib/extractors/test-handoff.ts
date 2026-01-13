#!/usr/bin/env bun
/**
 * Test script for HandoffGenerator
 *
 * Tests the handoff generation with mock data.
 */

import { generateHandoff, writeHandoff, type HandoffInput } from './HandoffGenerator';
import type { ExtractedLearning } from './LearningExtractor';

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║           HANDOFF GENERATOR TEST                              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// Test 1: Generate handoff with learnings
console.log('=== TEST 1: Generate handoff with learnings ===\n');

const mockLearnings: ExtractedLearning[] = [
  {
    statement: 'User prefers changes in PAI packs over direct dotfile edits',
    category: 'preference',
    confidence: 0.9,
    evidence: 'you changed my dotfiles directly...',
  },
  {
    statement: 'User needs compatibility with mac and ubuntu',
    category: 'context',
    confidence: 0.85,
    evidence: 'i need compatibility with mac and ubuntu',
  },
  {
    statement: 'User decided to use .claude as default fallback path',
    category: 'decision',
    confidence: 0.8,
    evidence: 'lets use .claude',
  },
  {
    statement: 'User corrected assumption about settings.json env vars',
    category: 'correction',
    confidence: 0.75,
    evidence: 'no, JSON doesnt expand environment variables',
  },
];

const input: HandoffInput = {
  sessionId: 'test-session-12345678',
  learnings: mockLearnings,
  sessionSummary: 'Worked on PAI memory system improvements and cross-platform compatibility.',
  workingDir: '/Users/nabil.bamoh/.claude/skills/MemoryEnhanced',
  filesAccessed: [
    '/Users/nabil.bamoh/.claude/skills/MemoryEnhanced/lib/extractors/LearningExtractor.ts',
    '/Users/nabil.bamoh/.claude/MEMORY/handoffs/latest.md',
  ],
  toolsUsed: [
    { tool: 'Read', count: 15 },
    { tool: 'Edit', count: 8 },
    { tool: 'Bash', count: 12 },
    { tool: 'Write', count: 3 },
  ],
};

const handoff = generateHandoff(input);
console.log('Generated handoff:\n');
console.log('─'.repeat(60));
console.log(handoff);
console.log('─'.repeat(60));

// Test 2: Generate empty handoff
console.log('\n=== TEST 2: Generate handoff with no learnings ===\n');

const emptyInput: HandoffInput = {
  sessionId: 'empty-session-87654321',
  learnings: [],
  sessionSummary: '',
  workingDir: '/Users/nabil.bamoh/project',
};

const emptyHandoff = generateHandoff(emptyInput);
console.log('Generated handoff:\n');
console.log('─'.repeat(60));
console.log(emptyHandoff);
console.log('─'.repeat(60));

// Test 3: Write handoff to disk (only if --write flag is passed)
if (process.argv.includes('--write')) {
  console.log('\n=== TEST 3: Write handoff to disk ===\n');
  const result = writeHandoff(handoff, input.sessionId);

  if (result.success) {
    console.log('✅ Handoff written successfully');
    console.log(`   Latest: ${result.latestPath}`);
    console.log(`   Archive: ${result.archivePath}`);
  } else {
    console.log(`❌ Failed to write handoff: ${result.error}`);
  }
} else {
  console.log('\n(Run with --write to test disk writing)\n');
}

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                    TEST COMPLETE                              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
