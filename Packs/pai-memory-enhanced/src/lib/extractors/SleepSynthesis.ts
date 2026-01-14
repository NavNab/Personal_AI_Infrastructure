#!/usr/bin/env bun

/**
 * SleepSynthesis - Unconscious processing when session ends
 *
 * Consolidates memories and discovers patterns using MultiLLM.
 * When MultiLLM is not available, gracefully falls back to Claude-only.
 *
 * Architecture:
 * 1. Collect today's hypotheses (from MemoryEnhanced)
 * 2. Query MultiLLM (TEXT-ONLY, no tools)
 * 3. Cross-model consensus? -> Promote hypothesis to fact
 * 4. Save insights to $PAI_DIR/MEMORY/insights/
 * 5. Next session loads insights into context
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { $ } from 'bun';
import { HypothesisStore } from '../../storage/HypothesisStore';
import { FactStore } from '../../storage/FactStore';
import { getMemoryDir, getPaiDir } from '../../config/defaults';
import type { Hypothesis } from '../../schema/Hypothesis';
import type { Fact } from '../../schema/Fact';
import { findPatterns, type PatternResult } from './PatternFinder';

// MultiLLM detection result
export interface MultiLLMStatus {
  available: boolean;
  providers: string[];
  teamFilePath: string;
}

// Individual provider response
export interface ProviderResponse {
  provider: string;
  response: string;
  success: boolean;
  error?: string;
}

// Synthesis result from querying multiple providers
export interface SynthesisResult {
  timestamp: string;
  hypothesesAnalyzed: number;
  providersQueried: string[];
  responses: ProviderResponse[];
  patterns: PatternResult[];
  consensus: ConsensusResult[];
  insightsGenerated: number;
  promotedToFact: string[];
}

// Consensus detection result
export interface ConsensusResult {
  pattern: string;
  agreeingProviders: string[];
  confidence: number;
  shouldPromote: boolean;
}

// Insight to save
export interface Insight {
  timestamp: string;
  type: 'pattern' | 'consensus' | 'synthesis';
  content: string;
  sources: string[];
  confidence: number;
  metadata?: Record<string, unknown>;
}

/**
 * Detect if MultiLLM pack is installed and configured
 * Checks for team.yaml existence and parses available providers
 */
export function detectMultiLLM(): MultiLLMStatus {
  const paiDir = getPaiDir();
  const teamFilePath = join(paiDir, 'config', 'team.yaml');

  if (!existsSync(teamFilePath)) {
    return {
      available: false,
      providers: [],
      teamFilePath,
    };
  }

  try {
    const content = readFileSync(teamFilePath, 'utf-8');
    // Parse YAML for provider names - handle both quoted and unquoted keys
    // Format: "name": "claude" or name: claude (with optional indentation)
    const providerBlocks = content.split(/^\s*-\s+"?name"?:/m).slice(1);
    const providers: string[] = [];

    for (const block of providerBlocks) {
      // Extract name (handles: "claude" or claude)
      const nameMatch = block.match(/^\s*"?(\w+)"?/);
      // Extract available (handles: "available": true or available: true)
      const availableMatch = block.match(/"?available"?:\s*(true|false)/i);

      if (nameMatch && availableMatch && availableMatch[1] === 'true') {
        providers.push(nameMatch[1]);
      }
    }

    return {
      available: providers.length > 0,
      providers,
      teamFilePath,
    };
  } catch (error) {
    return {
      available: false,
      providers: [],
      teamFilePath,
    };
  }
}

/**
 * Query a single provider with text-only prompt
 * Uses shell command to call the provider CLI directly
 */
async function queryProvider(
  provider: string,
  prompt: string
): Promise<ProviderResponse> {
  const TIMEOUT_MS = 60000; // 60s timeout

  try {
    let shellPromise;

    // Use Bun shell directly with proper argument passing
    switch (provider.toLowerCase()) {
      case 'claude':
        shellPromise = $`claude -p ${prompt}`.quiet();
        break;
      case 'codex':
        shellPromise = $`codex -p ${prompt}`.quiet();
        break;
      case 'gemini':
        shellPromise = $`gemini -p ${prompt}`.quiet();
        break;
      case 'ollama':
        shellPromise = $`ollama run llama3.2 ${prompt}`.quiet();
        break;
      default:
        // Generic fallback - try provider name as command
        shellPromise = $`${provider} -p ${prompt}`.quiet();
    }

    // Add timeout using Promise.race
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), TIMEOUT_MS);
    });

    const result = await Promise.race([shellPromise, timeoutPromise]);

    return {
      provider,
      response: result.stdout.toString().trim(),
      success: true,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      provider,
      response: '',
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Query Claude only (fallback when MultiLLM not available)
 */
async function queryClaudeOnly(prompt: string): Promise<ProviderResponse> {
  return queryProvider('claude', prompt);
}

/**
 * Build the synthesis prompt from hypotheses
 */
function buildSynthesisPrompt(hypotheses: Hypothesis[]): string {
  const observations = hypotheses
    .map((h, i) => `${i + 1}. "${h.statement}" (observed ${h.observationCount} times, tags: ${h.tags.join(', ')})`)
    .join('\n');

  return `You are analyzing patterns in user observations and preferences collected over time.

Here are the current observations (hypotheses) about the user:

${observations}

Analyze these observations and identify:
1. **Patterns**: What recurring themes or preferences do you see?
2. **Connections**: Which observations reinforce or relate to each other?
3. **Strong Signals**: Which observations appear frequently enough to be considered validated facts?
4. **Insights**: What can you infer about the user's working style, preferences, or needs?

Respond in a structured format:
- List each pattern you identify
- Note which observations support each pattern
- Rate your confidence (low/medium/high) for each insight
- Suggest which hypotheses should be promoted to validated facts

Be concise but thorough. Focus on actionable insights.`;
}

/**
 * Parse patterns from provider responses
 * Extracts structured insights from free-form text
 */
function parseProviderResponse(response: string): string[] {
  const insights: string[] = [];

  // Split by common pattern markers
  const lines = response.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Look for bullet points, numbered items, or pattern markers
    if (
      trimmed.startsWith('-') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('•') ||
      /^\d+\./.test(trimmed)
    ) {
      // Extract the content after the marker
      const content = trimmed
        .replace(/^[-*•]\s*/, '')
        .replace(/^\d+\.\s*/, '')
        .trim();

      if (content.length > 10) {
        insights.push(content);
      }
    }

    // Look for pattern/insight labels
    if (
      trimmed.toLowerCase().includes('pattern:') ||
      trimmed.toLowerCase().includes('insight:')
    ) {
      const content = trimmed
        .replace(/^(pattern|insight):\s*/i, '')
        .trim();

      if (content.length > 10) {
        insights.push(content);
      }
    }
  }

  return insights;
}

/**
 * Detect consensus across provider responses
 * Returns patterns where multiple providers agree
 */
function detectConsensus(
  responses: ProviderResponse[],
  minAgreement: number = 2
): ConsensusResult[] {
  const successfulResponses = responses.filter((r) => r.success);

  if (successfulResponses.length < 2) {
    // Can't have consensus with single response
    return [];
  }

  // Extract insights from each response
  const providerInsights = new Map<string, string[]>();
  for (const r of successfulResponses) {
    providerInsights.set(r.provider, parseProviderResponse(r.response));
  }

  // Find overlapping themes (simple keyword matching)
  const consensusResults: ConsensusResult[] = [];

  // Get all unique insights
  const allInsights: Array<{ provider: string; insight: string }> = [];
  for (const [provider, insights] of providerInsights) {
    for (const insight of insights) {
      allInsights.push({ provider, insight });
    }
  }

  // Group similar insights by keyword overlap
  const grouped = new Map<string, Set<string>>();

  for (const { provider, insight } of allInsights) {
    // Create a normalized key from important words
    const words = insight
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .sort()
      .join('-');

    if (!grouped.has(words)) {
      grouped.set(words, new Set());
    }
    grouped.get(words)!.add(provider);
  }

  // Convert to consensus results
  for (const [pattern, providers] of grouped) {
    if (providers.size >= minAgreement) {
      const agreeingProviders = Array.from(providers);
      const confidence = agreeingProviders.length / successfulResponses.length;

      consensusResults.push({
        pattern: pattern.replace(/-/g, ' '),
        agreeingProviders,
        confidence,
        shouldPromote: confidence >= 0.6, // 60%+ agreement threshold
      });
    }
  }

  return consensusResults.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Save insights to $PAI_DIR/MEMORY/insights/
 */
function saveInsights(insights: Insight[]): string {
  const memoryDir = getMemoryDir();
  const insightsDir = join(memoryDir, 'insights');

  if (!existsSync(insightsDir)) {
    mkdirSync(insightsDir, { recursive: true });
  }

  const today = new Date().toISOString().slice(0, 10);
  const insightsFile = join(insightsDir, `${today}-synthesis.json`);

  // Append to existing if present
  let existingInsights: Insight[] = [];
  if (existsSync(insightsFile)) {
    try {
      existingInsights = JSON.parse(readFileSync(insightsFile, 'utf-8'));
    } catch {
      // Start fresh if corrupted
    }
  }

  const allInsights = [...existingInsights, ...insights];
  writeFileSync(insightsFile, JSON.stringify(allInsights, null, 2));

  return insightsFile;
}

/**
 * Promote high-confidence hypotheses to facts
 */
function promoteToFacts(
  consensus: ConsensusResult[],
  hypotheses: Hypothesis[],
  factStore: FactStore
): string[] {
  const promoted: string[] = [];

  for (const c of consensus) {
    if (!c.shouldPromote) continue;

    // Find matching hypotheses
    const matching = hypotheses.filter((h) =>
      h.statement.toLowerCase().includes(c.pattern) ||
      c.pattern.split(' ').some((word) =>
        h.statement.toLowerCase().includes(word)
      )
    );

    for (const h of matching) {
      // Only promote if not already a fact
      const existingFacts = factStore.list(h.statement);
      if (existingFacts.length === 0) {
        factStore.add(
          `preference.${Date.now()}`,
          h.statement,
          [...h.tags, 'sleep-synthesis', 'multi-llm-consensus'],
          'medium'
        );
        promoted.push(h.statement);
      }
    }
  }

  return promoted;
}

/**
 * Main sleep synthesis function
 * Called when session ends to process and consolidate memories
 */
export async function runSleepSynthesis(options: {
  verbose?: boolean;
  dryRun?: boolean;
} = {}): Promise<SynthesisResult> {
  const { verbose = false, dryRun = false } = options;

  const hypothesisStore = new HypothesisStore();
  const factStore = new FactStore();

  // 1. Collect open hypotheses
  const hypotheses = hypothesisStore.getOpen();

  if (hypotheses.length === 0) {
    if (verbose) {
      console.log('No open hypotheses to synthesize.');
    }
    return {
      timestamp: new Date().toISOString(),
      hypothesesAnalyzed: 0,
      providersQueried: [],
      responses: [],
      patterns: [],
      consensus: [],
      insightsGenerated: 0,
      promotedToFact: [],
    };
  }

  if (verbose) {
    console.log(`Analyzing ${hypotheses.length} hypotheses...`);
  }

  // 2. Detect MultiLLM availability
  const multiLLM = detectMultiLLM();
  const responses: ProviderResponse[] = [];
  const providersQueried: string[] = [];

  // 3. Build synthesis prompt
  const prompt = buildSynthesisPrompt(hypotheses);

  if (verbose) {
    console.log(`MultiLLM available: ${multiLLM.available}`);
    if (multiLLM.available) {
      console.log(`Available providers: ${multiLLM.providers.join(', ')}`);
    }
  }

  // 4. Query providers (MultiLLM or Claude fallback)
  if (multiLLM.available) {
    // Query multiple providers in parallel
    const queries = multiLLM.providers.map((p) => queryProvider(p, prompt));
    const results = await Promise.all(queries);

    for (const result of results) {
      responses.push(result);
      if (result.success) {
        providersQueried.push(result.provider);
      }
    }
  } else {
    // Fallback to Claude-only
    if (verbose) {
      console.log('Falling back to Claude-only synthesis...');
    }

    const result = await queryClaudeOnly(prompt);
    responses.push(result);
    if (result.success) {
      providersQueried.push('claude');
    }
  }

  // 5. Find patterns using PatternFinder
  const patterns = findPatterns(hypotheses);

  // 6. Detect cross-model consensus
  const consensus = detectConsensus(responses);

  if (verbose) {
    console.log(`Found ${patterns.length} patterns`);
    console.log(`Found ${consensus.length} consensus items`);
  }

  // 7. Generate and save insights
  const insights: Insight[] = [];

  // Add pattern insights
  for (const p of patterns) {
    insights.push({
      timestamp: new Date().toISOString(),
      type: 'pattern',
      content: p.pattern,
      sources: p.supportingHypotheses,
      confidence: p.confidence,
      metadata: {
        frequency: p.frequency,
        tags: p.tags,
      },
    });
  }

  // Add consensus insights
  for (const c of consensus) {
    insights.push({
      timestamp: new Date().toISOString(),
      type: 'consensus',
      content: c.pattern,
      sources: c.agreeingProviders,
      confidence: c.confidence,
      metadata: {
        shouldPromote: c.shouldPromote,
      },
    });
  }

  // 8. Promote high-confidence items to facts (unless dry run)
  let promotedToFact: string[] = [];

  if (!dryRun && consensus.length > 0) {
    promotedToFact = promoteToFacts(consensus, hypotheses, factStore);
    if (verbose && promotedToFact.length > 0) {
      console.log(`Promoted ${promotedToFact.length} hypotheses to facts`);
    }
  }

  // 9. Save insights (unless dry run)
  if (!dryRun && insights.length > 0) {
    const insightsFile = saveInsights(insights);
    if (verbose) {
      console.log(`Saved ${insights.length} insights to ${insightsFile}`);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    hypothesesAnalyzed: hypotheses.length,
    providersQueried,
    responses,
    patterns,
    consensus,
    insightsGenerated: insights.length,
    promotedToFact,
  };
}

/**
 * Load insights for context injection in next session
 */
export function loadRecentInsights(daysBack: number = 7): Insight[] {
  const memoryDir = getMemoryDir();
  const insightsDir = join(memoryDir, 'insights');

  if (!existsSync(insightsDir)) {
    return [];
  }

  const allInsights: Insight[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  // Read recent insight files
  try {
    const files = Bun.spawnSync(['ls', insightsDir]).stdout.toString().trim().split('\n');

    for (const file of files) {
      if (!file.endsWith('-synthesis.json')) continue;

      const dateStr = file.replace('-synthesis.json', '');
      const fileDate = new Date(dateStr);

      if (fileDate >= cutoffDate) {
        const content = readFileSync(join(insightsDir, file), 'utf-8');
        const insights = JSON.parse(content) as Insight[];
        allInsights.push(...insights);
      }
    }
  } catch {
    // Return empty if any error
  }

  // Sort by timestamp descending
  return allInsights.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Format insights for context injection
 */
export function formatInsightsForContext(insights: Insight[]): string {
  if (insights.length === 0) {
    return '';
  }

  const lines = ['## Recent Sleep Synthesis Insights\n'];

  const highConfidence = insights.filter((i) => i.confidence >= 0.7);
  const mediumConfidence = insights.filter((i) => i.confidence >= 0.4 && i.confidence < 0.7);

  if (highConfidence.length > 0) {
    lines.push('### High Confidence Patterns');
    for (const i of highConfidence.slice(0, 5)) {
      lines.push(`- ${i.content}`);
    }
    lines.push('');
  }

  if (mediumConfidence.length > 0) {
    lines.push('### Emerging Patterns');
    for (const i of mediumConfidence.slice(0, 5)) {
      lines.push(`- ${i.content}`);
    }
  }

  return lines.join('\n');
}

// CLI interface
async function main() {
  const { parseArgs } = await import('util');

  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      verbose: { type: 'boolean', short: 'v' },
      'dry-run': { type: 'boolean' },
      'load-insights': { type: 'boolean', short: 'l' },
      days: { type: 'string', short: 'd' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(`
SleepSynthesis - Unconscious processing of memories

USAGE:
  bun run SleepSynthesis.ts [options]

OPTIONS:
  -v, --verbose     Show detailed output
  --dry-run         Analyze without saving or promoting
  -l, --load-insights  Load and display recent insights
  -d, --days <n>    Days of insights to load (default: 7)
  -h, --help        Show this help

DESCRIPTION:
  Consolidates hypotheses into patterns using MultiLLM (or Claude fallback).
  Detects consensus across providers and promotes validated patterns to facts.
  Saves insights to $PAI_DIR/MEMORY/insights/ for next session context.
`);
    return;
  }

  if (values['load-insights']) {
    const days = parseInt(values.days || '7', 10);
    const insights = loadRecentInsights(days);
    console.log(formatInsightsForContext(insights) || 'No recent insights found.');
    return;
  }

  console.log('Starting sleep synthesis...\n');

  const result = await runSleepSynthesis({
    verbose: values.verbose,
    dryRun: values['dry-run'],
  });

  console.log('\n=== Sleep Synthesis Complete ===');
  console.log(`Hypotheses analyzed: ${result.hypothesesAnalyzed}`);
  console.log(`Providers queried: ${result.providersQueried.join(', ') || 'none'}`);
  console.log(`Patterns found: ${result.patterns.length}`);
  console.log(`Consensus items: ${result.consensus.length}`);
  console.log(`Insights generated: ${result.insightsGenerated}`);
  console.log(`Promoted to fact: ${result.promotedToFact.length}`);

  if (values.verbose && result.promotedToFact.length > 0) {
    console.log('\nPromoted to facts:');
    for (const f of result.promotedToFact) {
      console.log(`  - ${f}`);
    }
  }
}

main().catch(console.error);
