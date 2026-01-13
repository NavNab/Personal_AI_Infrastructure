/**
 * Similarity Merger
 *
 * Detects and merges semantically similar hypotheses to prevent fragmentation.
 * Uses keyword overlap and fuzzy matching for similarity detection.
 *
 * Pipeline:
 * 1. Load all open hypotheses
 * 2. Calculate pairwise similarity scores
 * 3. Identify merge candidates (similarity > threshold)
 * 4. Merge duplicates (combine observation counts)
 * 5. Archive merged hypotheses
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Hypothesis structure from HypothesisStore
 */
interface Hypothesis {
  timestamp: string;
  statement: string;
  cues: string[];
  tags: string[];
  expiresOrdinal: number;
  status: 'open' | 'validated' | 'rejected' | 'expired';
  observationCount: number;
}

/**
 * Similarity result between two hypotheses
 */
interface SimilarityResult {
  hypothesis1: string;
  hypothesis2: string;
  score: number;
  matchedKeywords: string[];
}

/**
 * Merge result
 */
interface MergeResult {
  merged: number;
  kept: number;
  details: Array<{
    kept: string;
    merged: string;
    newObservationCount: number;
  }>;
}

/**
 * Stop words to ignore in similarity calculation
 */
const STOP_WORDS = new Set([
  'user', 'prefers', 'wants', 'needs', 'likes', 'the', 'a', 'an', 'is', 'are',
  'to', 'in', 'for', 'on', 'with', 'and', 'or', 'of', 'that', 'this', 'it',
  'be', 'as', 'at', 'by', 'from', 'has', 'have', 'had', 'not', 'but', 'what',
  'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'each',
  'which', 'she', 'he', 'do', 'how', 'their', 'if', 'will', 'up', 'other',
  'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would',
  'make', 'like', 'him', 'into', 'time', 'very', 'just', 'know', 'take', 'people',
  'should', 'must', 'being', 'first', 'over', 'new', 'also', 'after', 'way',
]);

/**
 * Extract meaningful keywords from a statement
 */
function extractKeywords(statement: string): string[] {
  return statement
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Calculate Jaccard similarity between two keyword sets
 */
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Calculate similarity score between two statements
 * Returns a score between 0 (no similarity) and 1 (identical)
 */
export function calculateSimilarity(statement1: string, statement2: string): SimilarityResult {
  const keywords1 = extractKeywords(statement1);
  const keywords2 = extractKeywords(statement2);

  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);

  const score = jaccardSimilarity(set1, set2);
  const matchedKeywords = [...set1].filter(k => set2.has(k));

  return {
    hypothesis1: statement1,
    hypothesis2: statement2,
    score,
    matchedKeywords,
  };
}

/**
 * Find all similar hypothesis pairs above threshold
 */
export function findSimilarPairs(
  hypotheses: Hypothesis[],
  threshold = 0.4
): SimilarityResult[] {
  const pairs: SimilarityResult[] = [];

  for (let i = 0; i < hypotheses.length; i++) {
    for (let j = i + 1; j < hypotheses.length; j++) {
      const result = calculateSimilarity(
        hypotheses[i].statement,
        hypotheses[j].statement
      );

      if (result.score >= threshold) {
        pairs.push(result);
      }
    }
  }

  // Sort by similarity score descending
  return pairs.sort((a, b) => b.score - a.score);
}

/**
 * Get the MEMORY directory path
 */
function getMemoryDir(): string {
  const candidates = [
    process.env.PAI_DIR ? path.join(process.env.PAI_DIR, 'MEMORY') : null,
    path.join(process.env.HOME || '', '.claude', 'MEMORY'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(process.env.HOME || '', '.claude', 'MEMORY');
}

/**
 * Load all hypotheses from the store
 */
export function loadHypotheses(): Hypothesis[] {
  const memoryDir = getMemoryDir();
  const hypothesesPath = path.join(memoryDir, 'hypotheses.jsonl');

  if (!fs.existsSync(hypothesesPath)) {
    return [];
  }

  const content = fs.readFileSync(hypothesesPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  return lines.map(line => JSON.parse(line) as Hypothesis);
}

/**
 * Save hypotheses back to the store
 */
function saveHypotheses(hypotheses: Hypothesis[]): void {
  const memoryDir = getMemoryDir();
  const hypothesesPath = path.join(memoryDir, 'hypotheses.jsonl');

  const content = hypotheses.map(h => JSON.stringify(h)).join('\n') + '\n';
  fs.writeFileSync(hypothesesPath, content, 'utf-8');
}

/**
 * Merge similar hypotheses
 *
 * Strategy:
 * - Keep the hypothesis with more observations
 * - If equal, keep the one with more tags
 * - If equal, keep the longer statement (more specific)
 * - Add observation counts together
 * - Merge tags
 */
export function mergeHypotheses(
  hypotheses: Hypothesis[],
  threshold = 0.4,
  dryRun = false
): MergeResult {
  const result: MergeResult = {
    merged: 0,
    kept: 0,
    details: [],
  };

  // Track which hypotheses have been merged
  const mergedIndices = new Set<number>();

  // Find similar pairs
  const pairs = findSimilarPairs(hypotheses, threshold);

  for (const pair of pairs) {
    // Find indices
    const idx1 = hypotheses.findIndex(h => h.statement === pair.hypothesis1);
    const idx2 = hypotheses.findIndex(h => h.statement === pair.hypothesis2);

    // Skip if either already merged
    if (mergedIndices.has(idx1) || mergedIndices.has(idx2)) {
      continue;
    }

    const h1 = hypotheses[idx1];
    const h2 = hypotheses[idx2];

    // Determine which to keep
    let keepIdx: number;
    let mergeIdx: number;

    if (h1.observationCount > h2.observationCount) {
      keepIdx = idx1;
      mergeIdx = idx2;
    } else if (h2.observationCount > h1.observationCount) {
      keepIdx = idx2;
      mergeIdx = idx1;
    } else if (h1.tags.length > h2.tags.length) {
      keepIdx = idx1;
      mergeIdx = idx2;
    } else if (h2.tags.length > h1.tags.length) {
      keepIdx = idx2;
      mergeIdx = idx1;
    } else if (h1.statement.length >= h2.statement.length) {
      keepIdx = idx1;
      mergeIdx = idx2;
    } else {
      keepIdx = idx2;
      mergeIdx = idx1;
    }

    // Mark as merged
    mergedIndices.add(mergeIdx);

    // Combine observation counts
    const newObservationCount =
      hypotheses[keepIdx].observationCount + hypotheses[mergeIdx].observationCount;

    // Merge tags
    const mergedTags = [...new Set([
      ...hypotheses[keepIdx].tags,
      ...hypotheses[mergeIdx].tags,
    ])];

    result.details.push({
      kept: hypotheses[keepIdx].statement,
      merged: hypotheses[mergeIdx].statement,
      newObservationCount,
    });

    if (!dryRun) {
      hypotheses[keepIdx].observationCount = newObservationCount;
      hypotheses[keepIdx].tags = mergedTags;
    }

    result.merged++;
  }

  // Filter out merged hypotheses
  if (!dryRun) {
    const filteredHypotheses = hypotheses.filter((_, idx) => !mergedIndices.has(idx));
    saveHypotheses(filteredHypotheses);
    result.kept = filteredHypotheses.length;
  } else {
    result.kept = hypotheses.length - mergedIndices.size;
  }

  return result;
}

/**
 * Generate a similarity report for review
 */
export function generateSimilarityReport(hypotheses: Hypothesis[], threshold = 0.3): string {
  const pairs = findSimilarPairs(hypotheses, threshold);

  if (pairs.length === 0) {
    return '# Similarity Report\n\nNo similar hypotheses found above threshold.\n';
  }

  const lines: string[] = [
    '# Similarity Report',
    '',
    `**Generated:** ${new Date().toISOString().split('T')[0]}`,
    `**Total Hypotheses:** ${hypotheses.length}`,
    `**Similarity Threshold:** ${threshold}`,
    `**Pairs Found:** ${pairs.length}`,
    '',
    '---',
    '',
    '## Similar Pairs',
    '',
  ];

  for (const pair of pairs) {
    const scorePercent = (pair.score * 100).toFixed(0);
    lines.push(`### Similarity: ${scorePercent}%`);
    lines.push('');
    lines.push(`**Statement 1:** "${pair.hypothesis1}"`);
    lines.push('');
    lines.push(`**Statement 2:** "${pair.hypothesis2}"`);
    lines.push('');
    lines.push(`**Matched Keywords:** ${pair.matchedKeywords.join(', ') || 'none'}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Run the similarity merger (main function)
 */
export function runSimilarityMerger(options: {
  threshold?: number;
  dryRun?: boolean;
} = {}): MergeResult {
  const { threshold = 0.4, dryRun = false } = options;

  const hypotheses = loadHypotheses();

  if (hypotheses.length < 2) {
    return { merged: 0, kept: hypotheses.length, details: [] };
  }

  return mergeHypotheses(hypotheses, threshold, dryRun);
}
