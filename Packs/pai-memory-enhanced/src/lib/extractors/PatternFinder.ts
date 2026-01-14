/**
 * PatternFinder - Cross-session pattern detection
 *
 * Analyzes hypotheses across sessions to find recurring patterns,
 * themes, and connections that emerge over time.
 */

import type { Hypothesis } from '../../schema/Hypothesis';

// Pattern detection result
export interface PatternResult {
  pattern: string;
  frequency: number;
  confidence: number;
  supportingHypotheses: string[];
  tags: string[];
  category: PatternCategory;
}

// Pattern categories
export type PatternCategory =
  | 'preference' // User preference patterns
  | 'workflow' // Workflow/process patterns
  | 'technical' // Technical choices/patterns
  | 'behavioral' // Behavioral patterns
  | 'temporal' // Time-based patterns
  | 'contextual'; // Context-dependent patterns

// Word frequency map
interface WordFrequency {
  word: string;
  count: number;
  hypotheses: string[];
}

// Tag cluster
interface TagCluster {
  tags: string[];
  count: number;
  hypotheses: Hypothesis[];
}

/**
 * Extract significant words from text
 * Filters out stop words and short words
 */
function extractSignificantWords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'and',
    'but', 'or', 'yet', 'if', 'because', 'while', 'although', 'user',
    'prefers', 'uses', 'wants', 'likes', 'typically', 'always', 'never',
    'usually', 'often', 'sometimes', 'rarely', 'that', 'this', 'it',
    'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'whose',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));
}

/**
 * Calculate word frequencies across all hypotheses
 */
function calculateWordFrequencies(hypotheses: Hypothesis[]): WordFrequency[] {
  const frequencies = new Map<string, WordFrequency>();

  for (const h of hypotheses) {
    const words = extractSignificantWords(h.statement);
    const uniqueWords = new Set(words);

    for (const word of uniqueWords) {
      const existing = frequencies.get(word);
      if (existing) {
        existing.count++;
        existing.hypotheses.push(h.timestamp);
      } else {
        frequencies.set(word, {
          word,
          count: 1,
          hypotheses: [h.timestamp],
        });
      }
    }
  }

  return Array.from(frequencies.values()).sort((a, b) => b.count - a.count);
}

/**
 * Find tag clusters - groups of tags that appear together
 */
function findTagClusters(hypotheses: Hypothesis[]): TagCluster[] {
  const tagCombinations = new Map<string, TagCluster>();

  for (const h of hypotheses) {
    if (h.tags.length === 0) continue;

    // Create a sorted key from tags
    const key = [...h.tags].sort().join('|');

    const existing = tagCombinations.get(key);
    if (existing) {
      existing.count++;
      existing.hypotheses.push(h);
    } else {
      tagCombinations.set(key, {
        tags: h.tags,
        count: 1,
        hypotheses: [h],
      });
    }
  }

  return Array.from(tagCombinations.values())
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count);
}

/**
 * Categorize a pattern based on its content and tags
 */
function categorizePattern(
  words: string[],
  tags: string[]
): PatternCategory {
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  const wordSet = new Set(words.map((w) => w.toLowerCase()));

  // Check for preference indicators
  if (
    tagSet.has('preference') ||
    wordSet.has('prefer') ||
    wordSet.has('like') ||
    wordSet.has('favorite')
  ) {
    return 'preference';
  }

  // Check for workflow indicators
  if (
    tagSet.has('workflow') ||
    tagSet.has('process') ||
    wordSet.has('workflow') ||
    wordSet.has('process') ||
    wordSet.has('steps')
  ) {
    return 'workflow';
  }

  // Check for technical indicators
  if (
    tagSet.has('technical') ||
    tagSet.has('code') ||
    tagSet.has('decision') ||
    wordSet.has('typescript') ||
    wordSet.has('javascript') ||
    wordSet.has('code') ||
    wordSet.has('implementation')
  ) {
    return 'technical';
  }

  // Check for temporal indicators
  if (
    wordSet.has('morning') ||
    wordSet.has('evening') ||
    wordSet.has('weekly') ||
    wordSet.has('daily') ||
    wordSet.has('time')
  ) {
    return 'temporal';
  }

  // Check for behavioral indicators
  if (
    tagSet.has('pattern') ||
    tagSet.has('behavioral') ||
    wordSet.has('tends') ||
    wordSet.has('usually') ||
    wordSet.has('behavior')
  ) {
    return 'behavioral';
  }

  // Default to contextual
  return 'contextual';
}

/**
 * Generate pattern description from frequent words
 */
function generatePatternDescription(
  frequentWords: WordFrequency[],
  hypotheses: Hypothesis[]
): string {
  // Get the top words
  const topWords = frequentWords.slice(0, 3).map((w) => w.word);

  // Find hypotheses containing these words
  const relevantHypotheses = hypotheses.filter((h) =>
    topWords.some((word) =>
      h.statement.toLowerCase().includes(word)
    )
  );

  if (relevantHypotheses.length === 0) {
    return topWords.join(' + ');
  }

  // Find common theme from relevant hypotheses
  const theme = topWords.join(', ');
  return `Recurring theme: ${theme}`;
}

/**
 * Calculate confidence score for a pattern
 */
function calculateConfidence(
  frequency: number,
  totalHypotheses: number,
  observationCounts: number[]
): number {
  // Base confidence from frequency
  const frequencyScore = Math.min(frequency / totalHypotheses, 1);

  // Bonus from high observation counts
  const avgObservations =
    observationCounts.reduce((a, b) => a + b, 0) / observationCounts.length;
  const observationBonus = Math.min(avgObservations / 5, 0.3); // Max 0.3 bonus

  // Combine scores
  const raw = frequencyScore * 0.7 + observationBonus;

  // Normalize to 0-1
  return Math.min(Math.max(raw, 0), 1);
}

/**
 * Find patterns in hypotheses using multiple strategies
 */
export function findPatterns(hypotheses: Hypothesis[]): PatternResult[] {
  if (hypotheses.length < 2) {
    return [];
  }

  const patterns: PatternResult[] = [];

  // Strategy 1: Word frequency patterns
  const wordFrequencies = calculateWordFrequencies(hypotheses);
  const frequentWords = wordFrequencies.filter((w) => w.count >= 2);

  if (frequentWords.length > 0) {
    // Group frequent words into patterns
    const topWords = frequentWords.slice(0, 10);

    for (const wordFreq of topWords) {
      // Find all hypotheses containing this word
      const supporting = hypotheses.filter((h) =>
        h.statement.toLowerCase().includes(wordFreq.word)
      );

      if (supporting.length >= 2) {
        // Collect unique tags
        const allTags = new Set<string>();
        for (const h of supporting) {
          for (const tag of h.tags) {
            allTags.add(tag);
          }
        }

        const confidence = calculateConfidence(
          supporting.length,
          hypotheses.length,
          supporting.map((h) => h.observationCount)
        );

        patterns.push({
          pattern: `Frequent mention of "${wordFreq.word}"`,
          frequency: supporting.length,
          confidence,
          supportingHypotheses: supporting.map((h) => h.statement),
          tags: Array.from(allTags),
          category: categorizePattern([wordFreq.word], Array.from(allTags)),
        });
      }
    }
  }

  // Strategy 2: Tag cluster patterns
  const tagClusters = findTagClusters(hypotheses);

  for (const cluster of tagClusters.slice(0, 5)) {
    const confidence = calculateConfidence(
      cluster.count,
      hypotheses.length,
      cluster.hypotheses.map((h) => h.observationCount)
    );

    patterns.push({
      pattern: `Cluster: ${cluster.tags.join(' + ')}`,
      frequency: cluster.count,
      confidence,
      supportingHypotheses: cluster.hypotheses.map((h) => h.statement),
      tags: cluster.tags,
      category: categorizePattern([], cluster.tags),
    });
  }

  // Strategy 3: High observation count patterns
  const highObservation = hypotheses
    .filter((h) => h.observationCount >= 3)
    .sort((a, b) => b.observationCount - a.observationCount);

  for (const h of highObservation.slice(0, 5)) {
    // Check if not already captured by other patterns
    const alreadyCaptured = patterns.some((p) =>
      p.supportingHypotheses.includes(h.statement)
    );

    if (!alreadyCaptured) {
      patterns.push({
        pattern: `High confidence: ${h.statement}`,
        frequency: h.observationCount,
        confidence: Math.min(h.observationCount / 5, 1),
        supportingHypotheses: [h.statement],
        tags: h.tags,
        category: categorizePattern(
          extractSignificantWords(h.statement),
          h.tags
        ),
      });
    }
  }

  // Deduplicate and sort by confidence
  const seen = new Set<string>();
  const uniquePatterns = patterns.filter((p) => {
    const key = p.pattern.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniquePatterns.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Find connections between hypotheses
 * Returns pairs of related hypotheses
 */
export function findConnections(
  hypotheses: Hypothesis[]
): Array<{ h1: Hypothesis; h2: Hypothesis; similarity: number }> {
  const connections: Array<{
    h1: Hypothesis;
    h2: Hypothesis;
    similarity: number;
  }> = [];

  for (let i = 0; i < hypotheses.length; i++) {
    for (let j = i + 1; j < hypotheses.length; j++) {
      const h1 = hypotheses[i];
      const h2 = hypotheses[j];

      // Check tag overlap
      const tags1 = new Set(h1.tags);
      const tags2 = new Set(h2.tags);
      const commonTags = h1.tags.filter((t) => tags2.has(t));

      // Check word overlap
      const words1 = new Set(extractSignificantWords(h1.statement));
      const words2 = extractSignificantWords(h2.statement);
      const commonWords = words2.filter((w) => words1.has(w));

      // Calculate similarity
      const tagSimilarity = commonTags.length / Math.max(tags1.size, tags2.size, 1);
      const wordSimilarity = commonWords.length / Math.max(words1.size, words2.length, 1);
      const similarity = tagSimilarity * 0.4 + wordSimilarity * 0.6;

      if (similarity >= 0.3) {
        connections.push({ h1, h2, similarity });
      }
    }
  }

  return connections.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Summarize patterns for human consumption
 */
export function summarizePatterns(patterns: PatternResult[]): string {
  if (patterns.length === 0) {
    return 'No significant patterns detected.';
  }

  const lines: string[] = ['## Pattern Analysis Summary\n'];

  // Group by category
  const byCategory = new Map<PatternCategory, PatternResult[]>();
  for (const p of patterns) {
    const existing = byCategory.get(p.category) || [];
    existing.push(p);
    byCategory.set(p.category, existing);
  }

  const categoryLabels: Record<PatternCategory, string> = {
    preference: 'User Preferences',
    workflow: 'Workflow Patterns',
    technical: 'Technical Choices',
    behavioral: 'Behavioral Patterns',
    temporal: 'Time-Based Patterns',
    contextual: 'Contextual Patterns',
  };

  for (const [category, categoryPatterns] of byCategory) {
    if (categoryPatterns.length === 0) continue;

    lines.push(`### ${categoryLabels[category]}`);

    for (const p of categoryPatterns.slice(0, 3)) {
      const confidenceLabel =
        p.confidence >= 0.7 ? 'HIGH' : p.confidence >= 0.4 ? 'MEDIUM' : 'LOW';
      lines.push(`- ${p.pattern} [${confidenceLabel}]`);

      if (p.supportingHypotheses.length > 0) {
        lines.push(`  Evidence: ${p.supportingHypotheses.slice(0, 2).join('; ')}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

// Export for CLI usage
export {
  calculateWordFrequencies,
  findTagClusters,
  extractSignificantWords,
};
