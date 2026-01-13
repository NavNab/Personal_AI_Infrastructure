/**
 * List command - unified view of all memories
 */

import { Command } from 'commander';
import { FactStore } from '../../storage/FactStore';
import { HypothesisStore } from '../../storage/HypothesisStore';
import { detectProject } from '../../lib/extractors/ContextInjector';

export const listCommand = new Command('list')
  .description('List all memories (facts and hypotheses)')
  .option('-f, --facts', 'Show only validated facts')
  .option('-h, --hypotheses', 'Show only hypotheses')
  .option('-o, --open', 'Show only open hypotheses')
  .option('-v, --validated', 'Show only validated hypotheses')
  .option('-p, --project <name>', 'Filter by project')
  .option('--limit <n>', 'Limit results', '50')
  .action((options) => {
    const factStore = new FactStore();
    const hypothesisStore = new HypothesisStore();
    const limit = parseInt(options.limit);

    // Detect current project
    const currentProject = detectProject(process.cwd());
    const projectName = options.project || currentProject?.name;

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    PAI MEMORY - LIST                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    if (projectName) {
      console.log(`\nProject: ${projectName}`);
    }
    console.log('');

    // Show facts unless --hypotheses only
    if (!options.hypotheses) {
      const facts = factStore.list(undefined, limit);

      // Filter by project if specified
      const filteredFacts = options.project
        ? facts.filter(f =>
            f.key.toLowerCase().includes(options.project.toLowerCase()) ||
            f.tags.some(t => t.toLowerCase().includes(options.project.toLowerCase()))
          )
        : facts;

      console.log(`=== VALIDATED FACTS (${filteredFacts.length}) ===`);
      console.log('');

      if (filteredFacts.length === 0) {
        console.log('  (no facts yet)');
      } else {
        for (const fact of filteredFacts) {
          const importance = fact.importance === 'high' ? ' ⭐' : '';
          const tags = fact.tags.length ? ` [${fact.tags.join(', ')}]` : '';
          console.log(`  ${fact.key}${importance}`);
          console.log(`    ${fact.value}${tags}`);
          console.log('');
        }
      }
    }

    // Show hypotheses unless --facts only
    if (!options.facts) {
      let status: 'open' | 'validated' | undefined;
      if (options.open) status = 'open';
      if (options.validated) status = 'validated';

      const hypotheses = hypothesisStore.list(status).slice(0, limit);

      // Filter by project if specified
      const filteredHypotheses = options.project
        ? hypotheses.filter(h =>
            h.statement.toLowerCase().includes(options.project.toLowerCase()) ||
            h.tags.some(t => t.toLowerCase().includes(options.project.toLowerCase()))
          )
        : hypotheses;

      // Group by status
      const open = filteredHypotheses.filter(h => h.status === 'open');
      const validated = filteredHypotheses.filter(h => h.status === 'validated');

      if (open.length > 0) {
        console.log(`=== OPEN HYPOTHESES (${open.length}) ===`);
        console.log('');
        for (const h of open) {
          const obsBar = '█'.repeat(Math.min(h.observationCount, 5)) + '░'.repeat(Math.max(0, 5 - h.observationCount));
          const tags = h.tags.length ? ` [${h.tags.join(', ')}]` : '';
          console.log(`  [${obsBar}] ${h.observationCount}/5 obs`);
          console.log(`    ${h.statement}${tags}`);
          console.log('');
        }
      }

      if (validated.length > 0) {
        console.log(`=== VALIDATED HYPOTHESES (${validated.length}) ===`);
        console.log('');
        for (const h of validated) {
          const tags = h.tags.length ? ` [${h.tags.join(', ')}]` : '';
          console.log(`  [✓ ${h.observationCount} obs] ${h.statement}${tags}`);
          console.log('');
        }
      }

      if (open.length === 0 && validated.length === 0 && !options.facts) {
        console.log('=== HYPOTHESES ===');
        console.log('');
        console.log('  (no hypotheses yet)');
        console.log('');
      }
    }
  });
