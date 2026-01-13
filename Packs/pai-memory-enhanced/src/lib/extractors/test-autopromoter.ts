#!/usr/bin/env bun
/**
 * Test script for AutoPromoter
 */

import {
  runAutoPromoter,
  checkPendingPromotions,
  getPromotionStats,
  findPromotionCandidates,
} from './AutoPromoter';

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║           AUTO PROMOTER TEST                                  ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// Get current stats
console.log('=== CURRENT PROMOTION STATS ===\n');
const stats = getPromotionStats();
console.log(`Total hypotheses: ${stats.totalHypotheses}`);
console.log(`Open hypotheses: ${stats.openHypotheses}`);
console.log(`Validated hypotheses: ${stats.validatedHypotheses}`);
console.log(`Total facts: ${stats.totalFacts}`);

if (stats.nearPromotion.length > 0) {
  console.log('\nHypotheses near promotion (3-4 observations):');
  for (const h of stats.nearPromotion) {
    console.log(`  - "${h.statement}" (${h.observationCount}/5, need ${h.needed} more)`);
  }
} else {
  console.log('\nNo hypotheses near promotion threshold.');
}

// Check pending promotions
console.log('\n=== PENDING PROMOTIONS (threshold: 5) ===\n');
const pending = checkPendingPromotions(5);
console.log(`Candidates ready for promotion: ${pending.count}`);
if (pending.count > 0) {
  for (const h of pending.hypotheses) {
    console.log(`  ✅ "${h.statement}" (${h.observationCount} observations)`);
  }
}

// Dry run with lower threshold for testing
console.log('\n=== DRY RUN (threshold: 1) ===\n');
const dryRunResult = runAutoPromoter({ threshold: 1, dryRun: true });
console.log(`Would promote: ${dryRunResult.promoted} hypotheses`);
console.log(`Would remain: ${dryRunResult.remaining} hypotheses`);

if (dryRunResult.details.length > 0) {
  console.log('\nPromotion details:');
  for (const d of dryRunResult.details) {
    console.log(`  PROMOTE: "${d.statement.slice(0, 60)}..."`);
    console.log(`  AS KEY:  ${d.key}`);
    console.log(`  OBS:     ${d.observationCount}\n`);
  }
}

// Show what would happen with real threshold
console.log('=== DRY RUN (threshold: 5, production) ===\n');
const prodDryRun = runAutoPromoter({ threshold: 5, dryRun: true });
console.log(`Would promote: ${prodDryRun.promoted} hypotheses`);
console.log(`Would remain: ${prodDryRun.remaining} hypotheses`);

if (prodDryRun.promoted === 0) {
  console.log('\nNo hypotheses meet the 5-observation threshold yet.');
  console.log('As you use the system, hypotheses will accumulate observations');
  console.log('and automatically promote to facts.');
}

// Test with --promote flag
if (process.argv.includes('--promote')) {
  console.log('\n=== EXECUTING PROMOTION (threshold: 5) ===\n');
  const result = runAutoPromoter({ threshold: 5, dryRun: false });
  console.log(`✅ Promoted ${result.promoted} hypotheses to facts`);
  console.log(`   Remaining open: ${result.remaining}`);

  if (result.details.length > 0) {
    console.log('\nPromoted:');
    for (const d of result.details) {
      console.log(`  - ${d.key}: "${d.statement}"`);
    }
  }
} else if (process.argv.includes('--force-promote')) {
  // Force promote with threshold 1 for testing
  console.log('\n=== FORCE PROMOTION (threshold: 1) ===\n');
  const result = runAutoPromoter({ threshold: 1, dryRun: false });
  console.log(`✅ Promoted ${result.promoted} hypotheses to facts`);
  console.log(`   Remaining open: ${result.remaining}`);
} else {
  console.log('\n(Run with --promote to promote eligible hypotheses)');
  console.log('(Run with --force-promote to promote all with threshold=1)');
}

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║                    TEST COMPLETE                              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
