/**
 * Stats command - show memory system statistics
 */

import { Command } from 'commander';
import { FactStore } from '../../storage/FactStore';
import { HypothesisStore } from '../../storage/HypothesisStore';
import { getContextStats, detectProject } from '../../lib/extractors/ContextInjector';

export const statsCommand = new Command('stats')
  .description('Show memory system statistics')
  .option('-v, --verbose', 'Show detailed breakdown')
  .action((options) => {
    const factStore = new FactStore();
    const hypothesisStore = new HypothesisStore();
    const stats = getContextStats();

    // Detect current project
    const currentProject = detectProject(process.cwd());

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║              PAI MEMORY - SYSTEM STATISTICS                   ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    // Overview
    console.log('=== OVERVIEW ===');
    console.log('');
    console.log(`  Validated Facts:      ${stats.totalFacts}`);
    console.log(`  Open Hypotheses:      ${stats.totalHypotheses}`);
    console.log(`  High-Confidence (3+): ${stats.highConfidenceHypotheses}`);
    console.log(`  Ready to Promote:     ${hypothesisStore.list('open').filter(h => h.observationCount >= 5).length}`);
    console.log('');

    // Observation distribution
    console.log('=== OBSERVATION DISTRIBUTION ===');
    console.log('');
    const maxObs = Math.max(...Object.keys(stats.hypothesisDistribution).map(Number), 5);
    for (let i = 1; i <= maxObs; i++) {
      const count = stats.hypothesisDistribution[i] || 0;
      const bar = '█'.repeat(count) || '░';
      const marker = i === 3 ? ' ← injected' : i === 5 ? ' ← promoted' : '';
      console.log(`  ${i} obs: ${bar} (${count})${marker}`);
    }
    console.log('');

    // Thresholds
    console.log('=== THRESHOLDS ===');
    console.log('');
    console.log('  Injection threshold:  3 observations (shown at session start)');
    console.log('  Promotion threshold:  5 observations (becomes permanent fact)');
    console.log('  Similarity threshold: 60% (fuzzy deduplication)');
    console.log('');

    // Project context
    if (currentProject) {
      console.log('=== CURRENT PROJECT ===');
      console.log('');
      console.log(`  Name: ${currentProject.name}`);
      console.log(`  Keywords: ${currentProject.keywords.join(', ')}`);
      console.log('');
    }

    // Verbose: detailed breakdown
    if (options.verbose) {
      console.log('=== FACTS BY IMPORTANCE ===');
      console.log('');
      const facts = factStore.list(undefined, 100);
      const byImportance = { high: 0, medium: 0, low: 0 };
      for (const f of facts) {
        byImportance[f.importance]++;
      }
      console.log(`  High:   ${byImportance.high}`);
      console.log(`  Medium: ${byImportance.medium}`);
      console.log(`  Low:    ${byImportance.low}`);
      console.log('');

      console.log('=== HYPOTHESES BY STATUS ===');
      console.log('');
      const allHypotheses = hypothesisStore.list();
      const byStatus: Record<string, number> = {};
      for (const h of allHypotheses) {
        byStatus[h.status] = (byStatus[h.status] || 0) + 1;
      }
      for (const [status, count] of Object.entries(byStatus)) {
        console.log(`  ${status}: ${count}`);
      }
      console.log('');

      // Tags breakdown
      console.log('=== TAGS ===');
      console.log('');
      const tagCounts: Record<string, number> = {};
      for (const f of facts) {
        for (const tag of f.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      for (const h of hypothesisStore.list('open')) {
        for (const tag of h.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
      for (const [tag, count] of sortedTags.slice(0, 10)) {
        console.log(`  ${tag}: ${count}`);
      }
      console.log('');
    }
  });
