/**
 * Hypothesis Sweeper - expire old hypotheses, promote confident ones
 *
 * Periodically sweeps through hypotheses to:
 * 1. Mark expired hypotheses as 'closed' or 'expired'
 * 2. Auto-promote hypotheses that have reached the observation threshold
 */

import * as fs from 'fs';
import { join } from 'path';
import { getMemoryDir, CONFIG } from '../config/defaults';
import {
  type Hypothesis,
  type HypothesisStatus,
  dayOrdinal,
  isExpired as checkExpired,
  promoteHypothesis
} from '../schema/Hypothesis';
import { createFact, type Fact } from '../schema/Fact';
import { FrequencyAuditLogger } from './FrequencyAuditLogger';
import { isReadyForPromotion } from './FrequencyConfidenceCalculator';

export interface SweepResult {
  checked: number;
  expired: number;
  promoted: number;
  factsCreated: number;
}

export interface SweeperOptions {
  closeOnExpiry?: boolean;
  expiryDays?: number;
}

export class HypothesisSweeper {
  private memoryDir: string;
  private hypothesesFile: string;
  private factsFile: string;
  private auditLogger: FrequencyAuditLogger;
  private closeOnExpiry: boolean;

  constructor(options: SweeperOptions = {}) {
    this.memoryDir = getMemoryDir();
    this.hypothesesFile = join(this.memoryDir, 'hypotheses.jsonl');
    this.factsFile = join(this.memoryDir, 'validated-facts.jsonl');
    this.auditLogger = new FrequencyAuditLogger();
    this.closeOnExpiry = options.closeOnExpiry ?? CONFIG.closeOnExpiry;
    this.ensureFiles();
  }

  private ensureFiles(): void {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
    if (!fs.existsSync(this.hypothesesFile)) {
      fs.writeFileSync(this.hypothesesFile, '');
    }
    if (!fs.existsSync(this.factsFile)) {
      fs.writeFileSync(this.factsFile, '');
    }
  }

  private readHypotheses(): Hypothesis[] {
    if (!fs.existsSync(this.hypothesesFile)) {
      return [];
    }
    const content = fs.readFileSync(this.hypothesesFile, 'utf-8');
    const hypotheses: Hypothesis[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        hypotheses.push(JSON.parse(line) as Hypothesis);
      } catch {
        // Skip malformed lines
      }
    }
    return hypotheses;
  }

  private writeHypotheses(hypotheses: Hypothesis[]): void {
    const content = hypotheses.map(h => JSON.stringify(h)).join('\n') + (hypotheses.length ? '\n' : '');
    fs.writeFileSync(this.hypothesesFile, content);
  }

  private appendFact(fact: Fact): void {
    fs.appendFileSync(this.factsFile, JSON.stringify(fact) + '\n');
  }

  /**
   * Run full sweep: expire old hypotheses and promote high-confidence ones to facts
   */
  sweep(): SweepResult {
    const result: SweepResult = {
      checked: 0,
      expired: 0,
      promoted: 0,
      factsCreated: 0,
    };

    const hypotheses = this.readHypotheses();
    result.checked = hypotheses.length;

    for (const hypothesis of hypotheses) {
      // Skip already processed hypotheses
      if (hypothesis.status === 'expired' || hypothesis.status === 'closed' || hypothesis.status === 'promoted') {
        continue;
      }

      // Check for expiry
      if (checkExpired(hypothesis)) {
        hypothesis.status = this.closeOnExpiry ? 'closed' : 'expired';
        result.expired++;

        this.auditLogger.log('hypothesis_expired', {
          statement: hypothesis.statement,
          observationCount: hypothesis.observationCount,
        });
        continue;
      }

      // Check for promotion readiness
      if (isReadyForPromotion(hypothesis)) {
        hypothesis.status = 'promoted';
        result.promoted++;

        // Create fact from hypothesis
        const fact = createFact(
          `promoted-${Date.now()}`,
          hypothesis.statement,
          hypothesis.tags,
          'high'
        );
        fact.observationCount = hypothesis.observationCount;
        this.appendFact(fact);
        result.factsCreated++;

        this.auditLogger.log('hypothesis_auto_promoted', {
          statement: hypothesis.statement,
          observationCount: hypothesis.observationCount,
        });
      }
    }

    // Write updated hypotheses back
    this.writeHypotheses(hypotheses);

    if (result.expired > 0) {
      this.auditLogger.log('hypotheses_expired', { count: result.expired });
    }

    if (result.promoted > 0) {
      this.auditLogger.log('hypotheses_promoted', { count: result.promoted });
    }

    return result;
  }

  /**
   * Get summary of current hypotheses state
   */
  getSummary(): {
    total: number;
    open: number;
    expiringSoon: number;
    readyForPromotion: number;
  } {
    const hypotheses = this.readHypotheses();
    const today = dayOrdinal();
    const soonThreshold = today + 2; // Within 2 days

    let open = 0;
    let expiringSoon = 0;
    let readyForPromotion = 0;

    for (const hypothesis of hypotheses) {
      if (hypothesis.status !== 'open') continue;

      open++;

      if (hypothesis.expiresOrdinal <= soonThreshold) {
        expiringSoon++;
      }

      if (isReadyForPromotion(hypothesis)) {
        readyForPromotion++;
      }
    }

    return {
      total: hypotheses.length,
      open,
      expiringSoon,
      readyForPromotion,
    };
  }

  /**
   * Get all open hypotheses
   */
  getOpen(): Hypothesis[] {
    return this.readHypotheses().filter(h => h.status === 'open');
  }

  /**
   * Get all promoted hypotheses
   */
  getPromoted(): Hypothesis[] {
    return this.readHypotheses().filter(h => h.status === 'promoted');
  }
}
