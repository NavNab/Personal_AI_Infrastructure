/**
 * Auto Promoter
 *
 * Automatically promotes hypotheses to facts based on observation count.
 * A hypothesis becomes a fact when it has been observed enough times
 * to be considered reliable knowledge.
 *
 * Default threshold: 5 observations
 *
 * Can be run:
 * - On session start (check for promotions)
 * - Via CLI command
 * - As a daily cron job
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Hypothesis structure
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
 * Fact structure
 */
interface Fact {
  timestamp: string;
  key: string;
  value: string;
  tags: string[];
  importance: 'low' | 'medium' | 'high';
  observationCount: number;
  promotedFrom?: string; // Original hypothesis statement
}

/**
 * Promotion result
 */
export interface PromotionResult {
  promoted: number;
  remaining: number;
  details: Array<{
    statement: string;
    key: string;
    observationCount: number;
  }>;
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
 * Load all hypotheses
 */
function loadHypotheses(): Hypothesis[] {
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
 * Save hypotheses
 */
function saveHypotheses(hypotheses: Hypothesis[]): void {
  const memoryDir = getMemoryDir();
  const hypothesesPath = path.join(memoryDir, 'hypotheses.jsonl');

  const content = hypotheses.map(h => JSON.stringify(h)).join('\n') + '\n';
  fs.writeFileSync(hypothesesPath, content, 'utf-8');
}

/**
 * Load all facts
 */
function loadFacts(): Fact[] {
  const memoryDir = getMemoryDir();
  const factsPath = path.join(memoryDir, 'validated-facts.jsonl');

  if (!fs.existsSync(factsPath)) {
    return [];
  }

  const content = fs.readFileSync(factsPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  return lines.map(line => JSON.parse(line) as Fact);
}

/**
 * Append a fact to the facts file
 */
function appendFact(fact: Fact): void {
  const memoryDir = getMemoryDir();
  const factsPath = path.join(memoryDir, 'validated-facts.jsonl');

  fs.appendFileSync(factsPath, JSON.stringify(fact) + '\n', 'utf-8');
}

/**
 * Generate a fact key from a hypothesis statement
 *
 * Examples:
 * "User prefers TypeScript" → "preferences.typescript"
 * "User needs compatibility with mac and ubuntu" → "requirements.compatibility"
 * "User wants simple implementations" → "preferences.simple_implementations"
 */
function generateFactKey(statement: string, tags: string[]): string {
  // Determine category from tags or content
  let category = 'general';

  if (tags.includes('preference') || statement.toLowerCase().includes('prefers')) {
    category = 'preferences';
  } else if (tags.includes('decision') || statement.toLowerCase().includes('decided')) {
    category = 'decisions';
  } else if (tags.includes('correction') || statement.toLowerCase().includes('correct')) {
    category = 'corrections';
  } else if (statement.toLowerCase().includes('needs') || statement.toLowerCase().includes('requires')) {
    category = 'requirements';
  } else if (statement.toLowerCase().includes('pattern') || statement.toLowerCase().includes('always')) {
    category = 'patterns';
  }

  // Extract key concept from statement
  const words = statement
    .toLowerCase()
    .replace(/^user\s+(prefers|wants|needs|likes|decided|corrected)\s+/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 3);

  const keyConcept = words.join('_') || 'unknown';

  return `${category}.${keyConcept}`;
}

/**
 * Determine importance based on tags and observation count
 */
function determineImportance(
  hypothesis: Hypothesis
): 'low' | 'medium' | 'high' {
  // High importance for frequently observed preferences
  if (hypothesis.observationCount >= 10) {
    return 'high';
  }

  // High importance for corrections (user explicitly corrected something)
  if (hypothesis.tags.includes('correction')) {
    return 'high';
  }

  // Medium importance for preferences and decisions
  if (hypothesis.tags.includes('preference') || hypothesis.tags.includes('decision')) {
    return 'medium';
  }

  return 'low';
}

/**
 * Find hypotheses ready for promotion
 */
export function findPromotionCandidates(
  hypotheses: Hypothesis[],
  threshold = 5
): Hypothesis[] {
  return hypotheses.filter(h =>
    h.status === 'open' &&
    h.observationCount >= threshold
  );
}

/**
 * Promote a single hypothesis to a fact
 */
function promoteToFact(hypothesis: Hypothesis): Fact {
  const key = generateFactKey(hypothesis.statement, hypothesis.tags);

  return {
    timestamp: new Date().toISOString(),
    key,
    value: hypothesis.statement,
    tags: [...hypothesis.tags, 'auto-promoted'],
    importance: determineImportance(hypothesis),
    observationCount: hypothesis.observationCount,
    promotedFrom: hypothesis.statement,
  };
}

/**
 * Run the auto-promoter
 *
 * @param options Configuration options
 * @returns Promotion result
 */
export function runAutoPromoter(options: {
  threshold?: number;
  dryRun?: boolean;
} = {}): PromotionResult {
  const { threshold = 5, dryRun = false } = options;

  const hypotheses = loadHypotheses();
  const candidates = findPromotionCandidates(hypotheses, threshold);

  const result: PromotionResult = {
    promoted: 0,
    remaining: 0,
    details: [],
  };

  if (candidates.length === 0) {
    result.remaining = hypotheses.filter(h => h.status === 'open').length;
    return result;
  }

  for (const candidate of candidates) {
    const fact = promoteToFact(candidate);

    result.details.push({
      statement: candidate.statement,
      key: fact.key,
      observationCount: candidate.observationCount,
    });

    if (!dryRun) {
      // Mark hypothesis as validated
      candidate.status = 'validated';

      // Append to facts
      appendFact(fact);
    }

    result.promoted++;
  }

  if (!dryRun) {
    // Save updated hypotheses
    saveHypotheses(hypotheses);
  }

  result.remaining = hypotheses.filter(h =>
    h.status === 'open' && h.observationCount < threshold
  ).length;

  return result;
}

/**
 * Check for pending promotions (for session start hook)
 */
export function checkPendingPromotions(threshold = 5): {
  count: number;
  hypotheses: Array<{ statement: string; observationCount: number }>;
} {
  const hypotheses = loadHypotheses();
  const candidates = findPromotionCandidates(hypotheses, threshold);

  return {
    count: candidates.length,
    hypotheses: candidates.map(h => ({
      statement: h.statement,
      observationCount: h.observationCount,
    })),
  };
}

/**
 * Manually promote a hypothesis by statement
 */
export function manualPromote(statement: string): boolean {
  const hypotheses = loadHypotheses();
  const hypothesis = hypotheses.find(
    h => h.statement.toLowerCase() === statement.toLowerCase() && h.status === 'open'
  );

  if (!hypothesis) {
    return false;
  }

  const fact = promoteToFact(hypothesis);
  hypothesis.status = 'validated';

  appendFact(fact);
  saveHypotheses(hypotheses);

  return true;
}

/**
 * Get promotion statistics
 */
export function getPromotionStats(): {
  totalHypotheses: number;
  openHypotheses: number;
  validatedHypotheses: number;
  totalFacts: number;
  nearPromotion: Array<{ statement: string; observationCount: number; needed: number }>;
} {
  const hypotheses = loadHypotheses();
  const facts = loadFacts();

  const open = hypotheses.filter(h => h.status === 'open');
  const validated = hypotheses.filter(h => h.status === 'validated');

  // Find hypotheses close to promotion (3-4 observations)
  const nearPromotion = open
    .filter(h => h.observationCount >= 3 && h.observationCount < 5)
    .map(h => ({
      statement: h.statement,
      observationCount: h.observationCount,
      needed: 5 - h.observationCount,
    }));

  return {
    totalHypotheses: hypotheses.length,
    openHypotheses: open.length,
    validatedHypotheses: validated.length,
    totalFacts: facts.length,
    nearPromotion,
  };
}
