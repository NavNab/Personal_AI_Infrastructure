/**
 * Hypothesis Store - temporary memory with expiry
 *
 * Stores hypotheses as JSONL, tracking observation counts
 * and expiry dates for automatic promotion/expiration.
 */

import { join } from 'path';
import { appendJsonl, readJsonl, writeJsonl } from './JsonlStore';
import { getMemoryDir, CONFIG } from '../config/defaults';
import type { Hypothesis, HypothesisStatus } from '../schema/Hypothesis';
import { createHypothesis, isExpired } from '../schema/Hypothesis';
import type { Cue } from '../schema/Cue';
import { calculateSimilarity } from '../lib/extractors/SimilarityMerger';

// Simple sweep result for HypothesisStore (no fact creation)
export interface StoreSweepResult {
  checked: number;
  expired: number;
  promoted: number;
}

export class HypothesisStore {
  private filePath: string;

  constructor() {
    const memoryDir = getMemoryDir();
    this.filePath = join(memoryDir, 'hypotheses.jsonl');
  }

  add(
    statement: string,
    expiryDays: number = CONFIG.defaultExpiryDays,
    cues: Cue[] = [],
    tags: string[] = []
  ): Hypothesis {
    // Check if similar hypothesis exists - increment observation count
    const existingTimestamp = this.findSimilarTimestamp(statement);
    if (existingTimestamp) {
      // Read all, find by timestamp, update count, write back
      const items = readJsonl<Hypothesis>(this.filePath);
      const existing = items.find((h) => h.timestamp === existingTimestamp);
      if (existing) {
        existing.observationCount += 1;
        writeJsonl(this.filePath, items);
        return existing;
      }
    }

    const hypothesis = createHypothesis(statement, expiryDays, cues, tags);
    appendJsonl(this.filePath, hypothesis);
    return hypothesis;
  }

  private findSimilarTimestamp(statement: string): string | undefined {
    // Search ALL hypotheses, not just 'open' ones
    // This prevents duplicates after promotion (validated/promoted status)
    const hypotheses = this.list(); // No status filter
    const normalized = statement.toLowerCase().trim();

    // 1. Exact match first (fastest)
    const exactMatch = hypotheses.find(
      (h) => h.statement.toLowerCase().trim() === normalized
    );
    if (exactMatch) return exactMatch.timestamp;

    // 2. Fuzzy match using keyword similarity (threshold: 0.6)
    // This catches semantically similar statements like:
    // "User prefers TypeScript" vs "User prefers to use TypeScript"
    const SIMILARITY_THRESHOLD = 0.6;
    for (const h of hypotheses) {
      const result = calculateSimilarity(statement, h.statement);
      if (result.score >= SIMILARITY_THRESHOLD) {
        return h.timestamp;
      }
    }

    return undefined;
  }

  list(status?: HypothesisStatus): Hypothesis[] {
    let items = readJsonl<Hypothesis>(this.filePath);
    if (status) {
      items = items.filter((h) => h.status === status);
    }
    return items;
  }

  /**
   * Sweep hypotheses - expire old ones, promote high-confidence ones
   */
  sweep(closeOnExpiry: boolean = CONFIG.closeOnExpiry): StoreSweepResult {
    const items = readJsonl<Hypothesis>(this.filePath);
    if (!items.length) {
      return { checked: 0, expired: 0, promoted: 0 };
    }

    let expired = 0;
    let promoted = 0;

    for (const item of items) {
      if (item.status === 'expired' || item.status === 'closed' || item.status === 'promoted') {
        continue;
      }

      // Check expiry
      if (isExpired(item)) {
        item.status = closeOnExpiry ? 'closed' : 'expired';
        expired++;
        continue;
      }

      // Check for promotion (observation count >= threshold)
      if (item.observationCount >= CONFIG.promotionThreshold) {
        item.status = 'promoted';
        promoted++;
      }
    }

    // Rewrite file
    writeJsonl(this.filePath, items);

    return { checked: items.length, expired, promoted };
  }

  getPromoted(): Hypothesis[] {
    return this.list('promoted');
  }

  getOpen(): Hypothesis[] {
    return this.list('open');
  }

  private updateAll(): void {
    const items = this.list();
    writeJsonl(this.filePath, items);
  }

  updateStatus(id: string, status: HypothesisStatus): boolean {
    const items = readJsonl<Hypothesis>(this.filePath);
    const item = items.find((h) => h.timestamp === id);
    if (item) {
      item.status = status;
      writeJsonl(this.filePath, items);
      return true;
    }
    return false;
  }
}
