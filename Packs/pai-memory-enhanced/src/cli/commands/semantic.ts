/**
 * Semantic search command - search memories by meaning
 */

import { Command } from 'commander';
import {
  semanticSearch,
  buildIndex,
  getIndexStats,
  formatSearchResults,
} from '../../lib/extractors/SemanticSearch';

export const semanticCommand = new Command('semantic')
  .description('Search memories by semantic similarity (meaning-based)')
  .argument('[query]', 'Search query (natural language)')
  .option('-b, --build', 'Build/update the embedding index')
  .option('-f, --force', 'Force rebuild entire index')
  .option('-s, --stats', 'Show index statistics')
  .option('-l, --limit <n>', 'Limit results', '10')
  .option('-t, --threshold <n>', 'Similarity threshold (0-1)', '0.3')
  .option('--facts', 'Search only facts')
  .option('--hypotheses', 'Search only hypotheses')
  .option('-v, --verbose', 'Verbose output')
  .action(async (query, options) => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║              PAI MEMORY - SEMANTIC SEARCH                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    // Build index
    if (options.build) {
      console.log('Building embedding index...');
      console.log('');

      try {
        const result = await buildIndex({
          force: options.force,
          verbose: options.verbose,
        });

        console.log('Index build complete:');
        console.log(`  Indexed: ${result.indexed}`);
        console.log(`  Skipped: ${result.skipped}`);
        console.log(`  Errors: ${result.errors}`);
        console.log('');

        if (result.errors > 0) {
          console.log('Note: Errors may indicate Ollama is not running.');
          console.log('Start Ollama with: ollama serve');
          console.log('');
        }
      } catch (error) {
        console.log('Error building index:', error);
        console.log('');
        console.log('Make sure Ollama is running: ollama serve');
        console.log('And nomic-embed-text is installed: ollama pull nomic-embed-text');
      }
      return;
    }

    // Show stats
    if (options.stats) {
      const stats = getIndexStats();

      console.log('=== EMBEDDING INDEX ===');
      console.log('');

      if (!stats.exists) {
        console.log('  No index found.');
        console.log('');
        console.log('  Run: pai-memory semantic --build');
        console.log('');
        return;
      }

      console.log(`  Status:      Active`);
      console.log(`  Model:       ${stats.model}`);
      console.log(`  Total:       ${stats.entryCount} entries`);
      console.log(`  Facts:       ${stats.factCount}`);
      console.log(`  Hypotheses:  ${stats.hypothesisCount}`);
      console.log(`  Updated:     ${stats.lastUpdated}`);
      console.log('');
      return;
    }

    // Search
    if (query) {
      const stats = getIndexStats();

      if (!stats.exists) {
        console.log('No embedding index found.');
        console.log('');
        console.log('Build the index first:');
        console.log('  pai-memory semantic --build');
        console.log('');
        return;
      }

      console.log(`Query: "${query}"`);
      console.log(`Threshold: ${options.threshold} | Limit: ${options.limit}`);
      console.log('');

      try {
        const type = options.facts ? 'fact' : options.hypotheses ? 'hypothesis' : 'all';

        const results = await semanticSearch(query, {
          limit: parseInt(options.limit),
          threshold: parseFloat(options.threshold),
          type,
        });

        console.log(formatSearchResults(results));
      } catch (error) {
        console.log('Search error:', error);
        console.log('');
        console.log('Make sure Ollama is running: ollama serve');
      }
      return;
    }

    // No arguments - show help
    console.log('Semantic search finds memories by meaning, not just keywords.');
    console.log('');
    console.log('Usage:');
    console.log('');
    console.log('  pai-memory semantic "how do I handle errors?"   Query memories');
    console.log('  pai-memory semantic --build                     Build index');
    console.log('  pai-memory semantic --build --force             Rebuild index');
    console.log('  pai-memory semantic --stats                     Show index info');
    console.log('');
    console.log('Options:');
    console.log('');
    console.log('  --limit <n>       Number of results (default: 10)');
    console.log('  --threshold <n>   Min similarity 0-1 (default: 0.3)');
    console.log('  --facts           Search only facts');
    console.log('  --hypotheses      Search only hypotheses');
    console.log('');
    console.log('Examples:');
    console.log('');
    console.log('  pai-memory semantic "coding style preferences"');
    console.log('  pai-memory semantic "what tools does the user prefer"');
    console.log('  pai-memory semantic "project architecture" --facts');
    console.log('');
  });
