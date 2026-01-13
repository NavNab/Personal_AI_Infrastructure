/**
 * Semantic Memory Search
 *
 * Enables querying memories by meaning using local embeddings (Ollama).
 * Transforms memory from "push" (injection) to "pull" (on-demand retrieval).
 *
 * Features:
 * - Generate embeddings for facts and hypotheses
 * - Store embeddings in a local index
 * - Query by semantic similarity
 * - Return ranked results
 */

import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { FactStore } from '../../storage/FactStore';
import { HypothesisStore } from '../../storage/HypothesisStore';
import { getMemoryDir } from '../../config/defaults';
import type { Fact } from '../../schema/Fact';
import type { Hypothesis } from '../../schema/Hypothesis';

const OLLAMA_URL = 'http://localhost:11434/api/embeddings';
const EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_DIMENSION = 768;

/**
 * Embedding index entry
 */
interface EmbeddingEntry {
  id: string;
  type: 'fact' | 'hypothesis';
  content: string;
  embedding: number[];
  metadata: {
    key?: string;
    tags?: string[];
    importance?: string;
    observationCount?: number;
    status?: string;
  };
}

/**
 * Embedding index
 */
interface EmbeddingIndex {
  version: string;
  model: string;
  dimension: number;
  lastUpdated: string;
  entries: EmbeddingEntry[];
}

/**
 * Search result
 */
export interface SemanticSearchResult {
  type: 'fact' | 'hypothesis';
  content: string;
  score: number;
  metadata: EmbeddingEntry['metadata'];
}

/**
 * Get the path to the embedding index file
 */
function getIndexPath(): string {
  const memoryDir = getMemoryDir();
  return join(memoryDir, 'embeddings', 'index.json');
}

/**
 * Load the embedding index from disk
 */
function loadIndex(): EmbeddingIndex | null {
  const indexPath = getIndexPath();
  if (!existsSync(indexPath)) return null;

  try {
    const data = readFileSync(indexPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Save the embedding index to disk
 */
function saveIndex(index: EmbeddingIndex): void {
  const indexPath = getIndexPath();
  const dir = join(getMemoryDir(), 'embeddings');

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Generate embedding for a text using Ollama
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text,
      }),
    });

    if (!response.ok) {
      console.error(`Embedding API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    return null;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Build or update the embedding index
 */
export async function buildIndex(options: {
  force?: boolean;
  verbose?: boolean;
} = {}): Promise<{
  indexed: number;
  skipped: number;
  errors: number;
}> {
  const { force = false, verbose = false } = options;

  const factStore = new FactStore();
  const hypothesisStore = new HypothesisStore();

  // Load existing index
  let index = loadIndex();
  const existingIds = new Set(index?.entries.map((e) => e.id) || []);

  if (force || !index) {
    index = {
      version: '1.0',
      model: EMBEDDING_MODEL,
      dimension: EMBEDDING_DIMENSION,
      lastUpdated: new Date().toISOString(),
      entries: [],
    };
  }

  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  // Index facts
  const facts = factStore.list(undefined, 1000);
  for (const fact of facts) {
    const id = `fact:${fact.timestamp}`;

    if (!force && existingIds.has(id)) {
      skipped++;
      continue;
    }

    if (verbose) console.log(`Indexing fact: ${fact.key}`);

    const content = `${fact.key}: ${fact.value}`;
    const embedding = await generateEmbedding(content);

    if (embedding) {
      // Remove existing entry if updating
      index.entries = index.entries.filter((e) => e.id !== id);

      index.entries.push({
        id,
        type: 'fact',
        content,
        embedding,
        metadata: {
          key: fact.key,
          tags: fact.tags,
          importance: fact.importance,
        },
      });
      indexed++;
    } else {
      errors++;
    }
  }

  // Index hypotheses (open + validated)
  const hypotheses = hypothesisStore.list();
  for (const h of hypotheses) {
    if (h.status === 'expired' || h.status === 'closed') continue;

    const id = `hypothesis:${h.timestamp}`;

    if (!force && existingIds.has(id)) {
      skipped++;
      continue;
    }

    if (verbose) console.log(`Indexing hypothesis: ${h.statement.slice(0, 50)}...`);

    const embedding = await generateEmbedding(h.statement);

    if (embedding) {
      // Remove existing entry if updating
      index.entries = index.entries.filter((e) => e.id !== id);

      index.entries.push({
        id,
        type: 'hypothesis',
        content: h.statement,
        embedding,
        metadata: {
          tags: h.tags,
          observationCount: h.observationCount,
          status: h.status,
        },
      });
      indexed++;
    } else {
      errors++;
    }
  }

  // Update timestamp and save
  index.lastUpdated = new Date().toISOString();
  saveIndex(index);

  return { indexed, skipped, errors };
}

/**
 * Search memories by semantic similarity
 */
export async function semanticSearch(
  query: string,
  options: {
    limit?: number;
    threshold?: number;
    type?: 'fact' | 'hypothesis' | 'all';
  } = {}
): Promise<SemanticSearchResult[]> {
  const { limit = 10, threshold = 0.3, type = 'all' } = options;

  // Load index
  const index = loadIndex();
  if (!index || index.entries.length === 0) {
    console.error('No embedding index found. Run buildIndex() first.');
    return [];
  }

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) {
    console.error('Failed to generate query embedding');
    return [];
  }

  // Calculate similarities
  const results: SemanticSearchResult[] = [];

  for (const entry of index.entries) {
    // Filter by type
    if (type !== 'all' && entry.type !== type) continue;

    const score = cosineSimilarity(queryEmbedding, entry.embedding);

    if (score >= threshold) {
      results.push({
        type: entry.type,
        content: entry.content,
        score,
        metadata: entry.metadata,
      });
    }
  }

  // Sort by score descending and limit
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Get index statistics
 */
export function getIndexStats(): {
  exists: boolean;
  entryCount: number;
  factCount: number;
  hypothesisCount: number;
  lastUpdated: string | null;
  model: string | null;
} {
  const index = loadIndex();

  if (!index) {
    return {
      exists: false,
      entryCount: 0,
      factCount: 0,
      hypothesisCount: 0,
      lastUpdated: null,
      model: null,
    };
  }

  return {
    exists: true,
    entryCount: index.entries.length,
    factCount: index.entries.filter((e) => e.type === 'fact').length,
    hypothesisCount: index.entries.filter((e) => e.type === 'hypothesis').length,
    lastUpdated: index.lastUpdated,
    model: index.model,
  };
}

/**
 * Format search results for display
 */
export function formatSearchResults(results: SemanticSearchResult[]): string {
  if (results.length === 0) {
    return 'No matching memories found.';
  }

  const lines: string[] = [];
  lines.push(`Found ${results.length} matching memories:\n`);

  for (const result of results) {
    const scorePercent = (result.score * 100).toFixed(0);
    const typeIcon = result.type === 'fact' ? '✓' : '○';
    const tags = result.metadata.tags?.length
      ? ` [${result.metadata.tags.join(', ')}]`
      : '';

    lines.push(`${typeIcon} [${scorePercent}%] ${result.content}${tags}`);

    if (result.type === 'hypothesis' && result.metadata.observationCount) {
      lines.push(`    ${result.metadata.observationCount} observation(s), ${result.metadata.status}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args[0] === '--build' || args[0] === '-b') {
    console.log('Building embedding index...\n');
    const force = args.includes('--force') || args.includes('-f');
    const verbose = args.includes('--verbose') || args.includes('-v');

    buildIndex({ force, verbose }).then((result) => {
      console.log(`\nIndexing complete:`);
      console.log(`  Indexed: ${result.indexed}`);
      console.log(`  Skipped: ${result.skipped}`);
      console.log(`  Errors: ${result.errors}`);
    });
  } else if (args[0] === '--stats' || args[0] === '-s') {
    const stats = getIndexStats();
    console.log('Embedding Index Statistics:');
    console.log(`  Exists: ${stats.exists}`);
    console.log(`  Total entries: ${stats.entryCount}`);
    console.log(`  Facts: ${stats.factCount}`);
    console.log(`  Hypotheses: ${stats.hypothesisCount}`);
    console.log(`  Last updated: ${stats.lastUpdated || 'never'}`);
    console.log(`  Model: ${stats.model || 'none'}`);
  } else if (args.length > 0 && !args[0].startsWith('-')) {
    const query = args.join(' ');
    console.log(`Searching for: "${query}"\n`);

    semanticSearch(query).then((results) => {
      console.log(formatSearchResults(results));
    });
  } else {
    console.log('Semantic Memory Search');
    console.log('');
    console.log('Usage:');
    console.log('  bun run SemanticSearch.ts <query>       Search memories');
    console.log('  bun run SemanticSearch.ts --build       Build embedding index');
    console.log('  bun run SemanticSearch.ts --build -f    Force rebuild index');
    console.log('  bun run SemanticSearch.ts --stats       Show index statistics');
  }
}
