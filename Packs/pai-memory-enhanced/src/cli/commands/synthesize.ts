/**
 * Synthesize command - generate session summaries from raw events
 *
 * Bridges raw event capture → structured knowledge in MEMORY/sessions/
 */

import { Command } from 'commander';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parseSessionsForDate, listRawEventFiles } from '../../lib/parsers/RawEventParser';
import { extractSessionSummary, generateDailySummaryMarkdown } from '../../lib/extractors/SessionExtractor';
import { getMemoryPaths } from '../../config/defaults';

export const synthesizeCommand = new Command('synthesize')
  .description('Synthesize raw events into structured session summaries')
  .option('-d, --date <date>', 'Date to synthesize (YYYY-MM-DD, default: today)')
  .option('--all', 'Synthesize all available dates')
  .option('--dry-run', 'Show what would be generated without writing')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    const { sessionsDir } = getMemoryPaths();

    // Ensure sessions directory exists
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }

    if (options.all) {
      // Process all available raw event files
      const files = listRawEventFiles();
      console.log(`\nFound ${files.length} raw event files\n`);

      let totalSessions = 0;
      let filesProcessed = 0;

      for (const file of files) {
        // Extract date from filename (e.g., 2026-01-13_all-events.jsonl)
        const match = file.match(/(\d{4}-\d{2}-\d{2})_all-events\.jsonl$/);
        if (!match) continue;

        const dateStr = match[1];
        const result = await synthesizeDate(dateStr, sessionsDir, options);
        if (result) {
          totalSessions += result.sessionCount;
          filesProcessed++;
        }
      }

      console.log(`\n✅ Processed ${filesProcessed} files, ${totalSessions} total sessions`);
    } else {
      // Process single date
      const dateStr = options.date || new Date().toISOString().slice(0, 10);
      await synthesizeDate(dateStr, sessionsDir, options);
    }
  });

async function synthesizeDate(
  dateStr: string,
  sessionsDir: string,
  options: { dryRun?: boolean; verbose?: boolean }
): Promise<{ sessionCount: number } | null> {
  const date = new Date(dateStr);
  const sessions = parseSessionsForDate(date);

  if (sessions.length === 0) {
    if (options.verbose) {
      console.log(`[${dateStr}] No sessions found`);
    }
    return null;
  }

  // Extract summaries
  const summaries = sessions.map(extractSessionSummary);

  // Generate markdown
  const markdown = generateDailySummaryMarkdown(dateStr, summaries);

  // Output path
  const outputPath = join(sessionsDir, `${dateStr}.md`);

  if (options.dryRun) {
    console.log(`\n[DRY RUN] Would create: ${outputPath}`);
    console.log(`  Sessions: ${summaries.length}`);
    console.log(`  Total duration: ${summaries.reduce((s, x) => s + x.durationMinutes, 0)} min`);
    if (options.verbose) {
      console.log('\n--- Preview ---\n');
      console.log(markdown.slice(0, 1000));
      if (markdown.length > 1000) console.log('\n... (truncated)');
    }
  } else {
    writeFileSync(outputPath, markdown);
    console.log(`✓ ${dateStr}: ${summaries.length} sessions → ${outputPath}`);
  }

  return { sessionCount: summaries.length };
}
