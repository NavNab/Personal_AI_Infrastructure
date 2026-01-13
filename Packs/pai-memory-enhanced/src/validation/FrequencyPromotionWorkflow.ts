/**
 * Frequency-Based Promotion Workflow - manage hypothesis -> fact lifecycle
 *
 * Uses observation count (frequency) to determine when a hypothesis
 * has enough evidence to be promoted to a validated fact.
 */

import * as fs from 'fs';
import { join } from 'path';
import { getMemoryDir } from '../config/defaults';
import { FrequencyAuditLogger } from './FrequencyAuditLogger';
import { CONFIG } from '../config/defaults';
import {
  calculateFrequencyConfidence,
  formatConfidence,
  isReadyForPromotion
} from './FrequencyConfidenceCalculator';
import {
  type Hypothesis,
  promoteHypothesis
} from '../schema/Hypothesis';
import { createFact, type Fact } from '../schema/Fact';

const DEFAULT_PROMOTION_THRESHOLD = 5;

export interface FrequencyPromotionResult {
  success: boolean;
  fact?: Fact;
  reason: string;
  confidenceInfo?: string;
}

export interface FrequencyReadinessCheck {
  ready: boolean;
  observationsNeeded: number;
  currentCount: number;
  threshold: number;
  progressBar: string;
}

export class FrequencyPromotionWorkflow {
  private memoryDir: string;
  private hypothesesFile: string;
  private factsFile: string;
  private auditLogger: FrequencyAuditLogger;
  private threshold: number;

  constructor() {
    this.memoryDir = getMemoryDir();
    this.hypothesesFile = join(this.memoryDir, 'hypotheses.jsonl');
    this.factsFile = join(this.memoryDir, 'validated-facts.jsonl');
    this.auditLogger = new FrequencyAuditLogger();
    this.threshold = CONFIG.promotionThreshold || DEFAULT_PROMOTION_THRESHOLD;
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
    if (!fs.existsSync(this.hypothesesFile)) return [];
    const content = fs.readFileSync(this.hypothesesFile, 'utf-8');
    const hypotheses: Hypothesis[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        hypotheses.push(JSON.parse(line) as Hypothesis);
      } catch {
        // Skip malformed
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

  private findHypothesis(search: string): Hypothesis | undefined {
    const hypotheses = this.readHypotheses();
    const searchLower = search.toLowerCase();
    return hypotheses.find(h =>
      h.status === 'open' &&
      h.statement.toLowerCase().includes(searchLower)
    );
  }

  /**
   * Manually promote a hypothesis to fact
   */
  promoteManual(statementSearch: string, reason: string): FrequencyPromotionResult {
    const hypothesis = this.findHypothesis(statementSearch);

    if (!hypothesis) {
      return { success: false, reason: 'Hypothesis not found' };
    }

    if (hypothesis.status !== 'open') {
      return { success: false, reason: `Hypothesis status is ${hypothesis.status}` };
    }

    // Update hypothesis status
    const hypotheses = this.readHypotheses();
    const idx = hypotheses.findIndex(h => h.statement === hypothesis.statement);
    if (idx >= 0) {
      hypotheses[idx].status = 'promoted';
      this.writeHypotheses(hypotheses);
    }

    // Create fact
    const fact = createFact(
      `manual-${Date.now()}`,
      hypothesis.statement,
      hypothesis.tags,
      'high'
    );
    fact.observationCount = hypothesis.observationCount;
    this.appendFact(fact);

    this.auditLogger.log('manual_promotion', {
      statement: hypothesis.statement,
      reason,
      observationCount: hypothesis.observationCount,
    });

    return {
      success: true,
      fact,
      reason: `Manually promoted: ${reason}`,
    };
  }

  /**
   * Check if hypothesis is ready for automatic promotion
   * Uses frequency-based readiness (observation count >= threshold)
   */
  checkReadiness(hypothesis: Hypothesis): FrequencyReadinessCheck {
    const confidence = calculateFrequencyConfidence(hypothesis, this.threshold);
    const progressBar = formatConfidence(confidence);

    return {
      ready: confidence.readyForPromotion,
      observationsNeeded: Math.max(0, this.threshold - confidence.observationCount),
      currentCount: confidence.observationCount,
      threshold: this.threshold,
      progressBar,
    };
  }

  /**
   * Attempt automatic promotion if threshold is met
   */
  attemptAutoPromotion(hypothesis: Hypothesis): FrequencyPromotionResult {
    if (hypothesis.status !== 'open') {
      return { success: false, reason: `Status is ${hypothesis.status}` };
    }

    const readiness = this.checkReadiness(hypothesis);

    if (!readiness.ready) {
      return {
        success: false,
        reason: `Needs ${readiness.observationsNeeded} more observations`,
        confidenceInfo: readiness.progressBar,
      };
    }

    // Update hypothesis status
    const hypotheses = this.readHypotheses();
    const idx = hypotheses.findIndex(h => h.statement === hypothesis.statement);
    if (idx >= 0) {
      hypotheses[idx].status = 'promoted';
      this.writeHypotheses(hypotheses);
    }

    // Create fact
    const fact = createFact(
      `auto-${Date.now()}`,
      hypothesis.statement,
      hypothesis.tags,
      'high'
    );
    fact.observationCount = hypothesis.observationCount;
    this.appendFact(fact);

    this.auditLogger.log('auto_promotion', {
      statement: hypothesis.statement,
      observationCount: hypothesis.observationCount,
      threshold: this.threshold,
    });

    return {
      success: true,
      fact,
      reason: 'Automatically promoted: threshold reached',
      confidenceInfo: readiness.progressBar,
    };
  }

  /**
   * Get all hypotheses ready for promotion
   */
  getPromotionCandidates(): Array<{
    hypothesis: Hypothesis;
    readiness: FrequencyReadinessCheck;
  }> {
    const hypotheses = this.readHypotheses().filter(h => h.status === 'open');

    return hypotheses
      .map(hypothesis => ({
        hypothesis,
        readiness: this.checkReadiness(hypothesis),
      }))
      .filter(item => item.readiness.ready);
  }

  /**
   * Promote all ready hypotheses
   */
  promoteAllReady(): {
    promoted: number;
    results: FrequencyPromotionResult[];
  } {
    const candidates = this.getPromotionCandidates();
    const results: FrequencyPromotionResult[] = [];

    for (const { hypothesis } of candidates) {
      const result = this.attemptAutoPromotion(hypothesis);
      results.push(result);
    }

    const promoted = results.filter(r => r.success).length;

    if (promoted > 0) {
      this.auditLogger.log('batch_promotion', {
        promoted,
        total: candidates.length,
      });
    }

    return { promoted, results };
  }

  /**
   * Get promotion statistics
   */
  getStats(): {
    totalHypotheses: number;
    totalFacts: number;
    readyForPromotion: number;
    averageProgress: number;
  } {
    const hypotheses = this.readHypotheses();
    const openHypotheses = hypotheses.filter(h => h.status === 'open');

    // Count facts
    let factCount = 0;
    if (fs.existsSync(this.factsFile)) {
      const content = fs.readFileSync(this.factsFile, 'utf-8');
      factCount = content.split('\n').filter(l => l.trim()).length;
    }

    let totalProgress = 0;
    let readyForPromotion = 0;

    for (const h of openHypotheses) {
      const confidence = calculateFrequencyConfidence(h, this.threshold);
      totalProgress += Math.min(1, confidence.confidence);
      if (confidence.readyForPromotion) {
        readyForPromotion++;
      }
    }

    return {
      totalHypotheses: hypotheses.length,
      totalFacts: factCount,
      readyForPromotion,
      averageProgress: openHypotheses.length > 0 ? totalProgress / openHypotheses.length : 0,
    };
  }
}
