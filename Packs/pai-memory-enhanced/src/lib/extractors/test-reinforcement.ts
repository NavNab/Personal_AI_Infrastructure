#!/usr/bin/env bun
/**
 * Test reinforcement - verify similar hypotheses increment count instead of creating duplicates
 */

import { HypothesisStore } from '../../storage/HypothesisStore';
import { calculateSimilarity } from './SimilarityMerger';

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║           REINFORCEMENT TEST                                  ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const store = new HypothesisStore();

// Get initial state
const initialHypotheses = store.list('open');
console.log(`Initial open hypotheses: ${initialHypotheses.length}\n`);

// Show current hypotheses
console.log('=== CURRENT HYPOTHESES ===\n');
for (const h of initialHypotheses) {
  console.log(`  [${h.observationCount}] ${h.statement.slice(0, 60)}...`);
}

// Test 1: Exact match reinforcement
console.log('\n=== TEST 1: EXACT MATCH ===\n');
const existingStatement = initialHypotheses[0]?.statement;
if (existingStatement) {
  const beforeCount = store.list('open').find(h => h.statement === existingStatement)?.observationCount || 0;
  console.log(`Before: "${existingStatement.slice(0, 50)}..." has ${beforeCount} observations`);

  // Add the same statement again
  const result = store.add(existingStatement, 30, [], ['test-exact']);
  console.log(`After:  "${existingStatement.slice(0, 50)}..." has ${result.observationCount} observations`);
  console.log(`Result: ${result.observationCount === beforeCount + 1 ? '✅ PASS - count incremented' : '❌ FAIL - count not incremented'}`);
} else {
  console.log('No existing hypotheses to test exact match');
}

// Test 2: Fuzzy match reinforcement
console.log('\n=== TEST 2: FUZZY MATCH ===\n');
const fuzzyTestPairs = [
  {
    original: 'User prefers simple implementations first',
    similar: 'User prefers simple implementations before complex ones',
  },
  {
    original: 'User prefers TypeScript over JavaScript',
    similar: 'User prefers to use TypeScript instead of JavaScript',
  },
];

for (const pair of fuzzyTestPairs) {
  const similarity = calculateSimilarity(pair.original, pair.similar);
  console.log(`Original: "${pair.original}"`);
  console.log(`Similar:  "${pair.similar}"`);
  console.log(`Similarity score: ${(similarity.score * 100).toFixed(0)}%`);
  console.log(`Matched keywords: ${similarity.matchedKeywords.join(', ')}`);
  console.log(`Would match (>=60%): ${similarity.score >= 0.6 ? 'YES' : 'NO'}\n`);
}

// Test 3: Verify no duplicates created
console.log('=== TEST 3: DUPLICATE PREVENTION ===\n');
const countBefore = store.list('open').length;

// Try adding a similar statement to one that exists
if (initialHypotheses.length > 0) {
  const testStatement = initialHypotheses[0].statement;
  store.add(testStatement, 30, [], ['test-duplicate']);
  const countAfter = store.list('open').length;

  console.log(`Hypotheses before: ${countBefore}`);
  console.log(`Hypotheses after:  ${countAfter}`);
  console.log(`Result: ${countAfter === countBefore ? '✅ PASS - no duplicate created' : '❌ FAIL - duplicate created'}`);
}

// Final state
console.log('\n=== FINAL STATE ===\n');
const finalHypotheses = store.list('open');
console.log(`Total open hypotheses: ${finalHypotheses.length}`);
for (const h of finalHypotheses.slice(0, 5)) {
  console.log(`  [${h.observationCount}] ${h.statement.slice(0, 60)}...`);
}

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║                    TEST COMPLETE                              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
