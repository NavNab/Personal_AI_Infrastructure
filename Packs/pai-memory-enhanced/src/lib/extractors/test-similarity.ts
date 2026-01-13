#!/usr/bin/env bun
/**
 * Test script for SimilarityMerger
 */

import {
  loadHypotheses,
  calculateSimilarity,
  findSimilarPairs,
  generateSimilarityReport,
  runSimilarityMerger,
} from './SimilarityMerger';

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║           SIMILARITY MERGER TEST                              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// Load hypotheses
const hypotheses = loadHypotheses();
console.log(`Loaded ${hypotheses.length} hypotheses\n`);

// Show all hypotheses
console.log('=== CURRENT HYPOTHESES ===\n');
for (const h of hypotheses) {
  console.log(`- "${h.statement}"`);
  console.log(`  Tags: [${h.tags.join(', ')}], Observations: ${h.observationCount}`);
}

// Find similar pairs
console.log('\n=== SIMILARITY ANALYSIS ===\n');
const pairs = findSimilarPairs(hypotheses, 0.2); // Lower threshold for testing

if (pairs.length === 0) {
  console.log('No similar pairs found above threshold.');
} else {
  console.log(`Found ${pairs.length} similar pairs:\n`);
  for (const pair of pairs) {
    const scorePercent = (pair.score * 100).toFixed(0);
    console.log(`[${scorePercent}%] "${pair.hypothesis1.slice(0, 50)}..."`);
    console.log(`       "${pair.hypothesis2.slice(0, 50)}..."`);
    console.log(`       Matched: ${pair.matchedKeywords.join(', ')}\n`);
  }
}

// Test specific similarity calculation
console.log('=== SPECIFIC SIMILARITY TESTS ===\n');

const testPairs = [
  ['User prefers TypeScript', 'User likes TypeScript for development'],
  ['User wants simple code', 'User prefers simple implementations first'],
  ['User needs core skills to be universal', 'CORE skill should be universal for all users'],
];

for (const [s1, s2] of testPairs) {
  const result = calculateSimilarity(s1, s2);
  console.log(`"${s1}"`);
  console.log(`"${s2}"`);
  console.log(`Score: ${(result.score * 100).toFixed(0)}%, Matched: ${result.matchedKeywords.join(', ')}\n`);
}

// Dry run merge
console.log('=== DRY RUN MERGE (threshold 0.4) ===\n');
const dryRunResult = runSimilarityMerger({ threshold: 0.4, dryRun: true });
console.log(`Would merge: ${dryRunResult.merged} hypotheses`);
console.log(`Would keep: ${dryRunResult.kept} hypotheses`);

if (dryRunResult.details.length > 0) {
  console.log('\nMerge details:');
  for (const d of dryRunResult.details) {
    console.log(`  KEEP: "${d.kept.slice(0, 60)}..."`);
    console.log(`  MERGE: "${d.merged.slice(0, 60)}..."`);
    console.log(`  New observation count: ${d.newObservationCount}\n`);
  }
}

// Generate report
console.log('\n=== SIMILARITY REPORT ===\n');
console.log(generateSimilarityReport(hypotheses, 0.2));

// Ask before actual merge
if (process.argv.includes('--merge')) {
  console.log('\n=== EXECUTING MERGE ===\n');
  const result = runSimilarityMerger({ threshold: 0.4, dryRun: false });
  console.log(`✅ Merged ${result.merged} hypotheses`);
  console.log(`   Kept ${result.kept} hypotheses`);
} else {
  console.log('\n(Run with --merge to actually merge similar hypotheses)\n');
}

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                    TEST COMPLETE                              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
