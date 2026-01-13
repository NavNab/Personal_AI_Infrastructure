/**
 * Search command - search memories by keyword
 */

import { Command } from 'commander';
import { FactStore } from '../../storage/FactStore';
import { HypothesisStore } from '../../storage/HypothesisStore';

export const searchCommand = new Command('search')
  .description('Search memories by keyword')
  .argument('<query>', 'Search query')
  .option('-f, --facts', 'Search only facts')
  .option('-h, --hypotheses', 'Search only hypotheses')
  .option('--limit <n>', 'Limit results', '20')
  .action((query, options) => {
    const factStore = new FactStore();
    const hypothesisStore = new HypothesisStore();
    const limit = parseInt(options.limit);
    const queryLower = query.toLowerCase();

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                  PAI MEMORY - SEARCH                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Query: "${query}"`);
    console.log('');

    let totalResults = 0;

    // Search facts
    if (!options.hypotheses) {
      const facts = factStore.list(undefined, 100);
      const matchingFacts = facts.filter(f =>
        f.key.toLowerCase().includes(queryLower) ||
        f.value.toLowerCase().includes(queryLower) ||
        f.tags.some(t => t.toLowerCase().includes(queryLower))
      ).slice(0, limit);

      if (matchingFacts.length > 0) {
        console.log(`=== FACTS (${matchingFacts.length} matches) ===`);
        console.log('');
        for (const fact of matchingFacts) {
          const importance = fact.importance === 'high' ? ' ⭐' : '';
          const tags = fact.tags.length ? ` [${fact.tags.join(', ')}]` : '';

          // Highlight matches
          const highlightedValue = highlightMatches(fact.value, query);

          console.log(`  ${fact.key}${importance}${tags}`);
          console.log(`    ${highlightedValue}`);
          console.log('');
        }
        totalResults += matchingFacts.length;
      }
    }

    // Search hypotheses
    if (!options.facts) {
      const hypotheses = hypothesisStore.list();
      const matchingHypotheses = hypotheses.filter(h =>
        h.statement.toLowerCase().includes(queryLower) ||
        h.tags.some(t => t.toLowerCase().includes(queryLower))
      ).slice(0, limit);

      if (matchingHypotheses.length > 0) {
        console.log(`=== HYPOTHESES (${matchingHypotheses.length} matches) ===`);
        console.log('');
        for (const h of matchingHypotheses) {
          const status = h.status === 'validated' ? '✓' : h.status === 'open' ? '○' : '×';
          const obsBar = h.status === 'open'
            ? `[${h.observationCount}/5]`
            : `[${h.observationCount} obs]`;
          const tags = h.tags.length ? ` [${h.tags.join(', ')}]` : '';

          // Highlight matches
          const highlightedStatement = highlightMatches(h.statement, query);

          console.log(`  ${status} ${obsBar} ${highlightedStatement}${tags}`);
          console.log('');
        }
        totalResults += matchingHypotheses.length;
      }
    }

    // No results
    if (totalResults === 0) {
      console.log('  No matches found.');
      console.log('');
      console.log('  Tips:');
      console.log('  - Try different keywords');
      console.log('  - Use shorter search terms');
      console.log('  - Check spelling');
      console.log('');
    } else {
      console.log(`Total: ${totalResults} result(s)`);
      console.log('');
    }
  });

/**
 * Highlight matching text (using ANSI codes for terminal)
 */
function highlightMatches(text: string, query: string): string {
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '\x1b[1;33m$1\x1b[0m'); // Bold yellow
}

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
