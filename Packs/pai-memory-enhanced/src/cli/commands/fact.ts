/**
 * Fact command - add and list facts
 */

import { Command } from 'commander';
import { FactStore } from '../../storage/FactStore';

export const factCommand = new Command('fact')
  .description('Manage facts')
  .argument('[key]', 'Fact key')
  .argument('[value]', 'Fact value')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-i, --importance <level>', 'Importance: low, medium, high', 'medium')
  .option('-l, --list', 'List all facts')
  .option('-q, --query <query>', 'Search facts')
  .option('--limit <n>', 'Limit results', '20')
  .action((key, value, options) => {
    const store = new FactStore();

    if (options.list || options.query) {
      // List facts
      const facts = store.list(options.query, parseInt(options.limit));
      console.log(`\n=== Facts (${facts.length}) ===\n`);
      for (const fact of facts) {
        const tags = fact.tags.length ? ` [${fact.tags.join(', ')}]` : '';
        console.log(`[${fact.importance}] ${fact.key}: ${fact.value}${tags}`);
        console.log(`  Observed: ${fact.observationCount || 1}x | ${fact.timestamp}`);
        console.log('');
      }
    } else if (key && value) {
      // Add fact
      const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [];
      const fact = store.add(key, value, tags, options.importance);
      console.log(`\n✓ Fact added: ${fact.key}`);
      console.log(`  Value: ${fact.value}`);
      console.log(`  Tags: ${fact.tags.join(', ') || 'none'}`);
      console.log(`  Importance: ${fact.importance}`);
    } else {
      console.log('Usage: pai-memory fact <key> <value> [options]');
      console.log('       pai-memory fact --list');
    }
  });
