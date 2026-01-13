/**
 * Signal Sampler
 *
 * Intelligently samples conversation messages to fit within LLM context limits
 * while prioritizing messages that contain learning signals (preferences,
 * decisions, corrections).
 *
 * Strategy:
 * 1. Score each message by learning signal patterns
 * 2. Always include first N messages (context)
 * 3. Always include last N messages (recency)
 * 4. Fill remaining budget with highest-signal messages
 */

import type { ConversationMessage } from './TranscriptReader';
import { estimateTokens } from './TranscriptReader';

/**
 * Learning signal categories with regex patterns
 */
export const LEARNING_SIGNALS = {
  preference: [
    /\bi\s+(prefer|like|want|need|always|never)\b/i,
    /\b(use|using|prefer)\s+\w+\s+(instead|over|rather)/i,
    /\bkeep\s+it\s+simple/i,
    /\bdon['']t\s+(want|like|need)/i,
    /\bi\s+(hate|love|enjoy)\b/i,
  ],
  decision: [
    /\b(let['']s|we['']ll|we\s+should|decided|going\s+to)\b/i,
    /\b(build|create|implement|use)\s+\w+\s+(first|instead)/i,
    /\bwe\s+(can|will|need\s+to)\b/i,
    /\bi\s+(chose|picked|selected)\b/i,
  ],
  correction: [
    /\b(no|not|actually|wrong|incorrect)\b/i,
    /\bthe\s+(question|point|issue)\s+is\b/i,
    /\byou\s+(did|didn['']t|should|shouldn['']t)\b/i,
    /\bthat['']s\s+not\b/i,
    /\bwait\b/i,
  ],
};

/**
 * Signal detection result for a message
 */
export interface SignalResult {
  /** Which signal categories were detected */
  signals: string[];
  /** Total signal score (higher = more learning potential) */
  score: number;
}

/**
 * Scored message ready for sampling
 */
export interface ScoredMessage extends ConversationMessage {
  /** Detected signal categories */
  signals: string[];
  /** Signal score (0-3+) */
  signalScore: number;
  /** Original index in message array */
  originalIndex: number;
}

/**
 * Sampling configuration
 */
export interface SamplerConfig {
  /** Maximum tokens for sampled output (default: 18000) */
  maxTokens: number;
  /** Tokens reserved for first N messages (default: 3000) */
  contextBudget: number;
  /** Tokens reserved for last N messages (default: 5000) */
  recencyBudget: number;
  /** Minimum messages to always include from start (default: 3) */
  minContextMessages: number;
  /** Minimum messages to always include from end (default: 10) */
  minRecencyMessages: number;
}

/**
 * Default sampler configuration
 */
export const DEFAULT_CONFIG: SamplerConfig = {
  maxTokens: 18000, // Leave room for prompt + output in 20K budget
  contextBudget: 3000,
  recencyBudget: 5000,
  minContextMessages: 3,
  minRecencyMessages: 10,
};

/**
 * Detect learning signals in text
 *
 * @param text - Message content to analyze
 * @returns Signal detection result
 */
export function detectSignals(text: string): SignalResult {
  const signals: Set<string> = new Set();

  for (const [category, patterns] of Object.entries(LEARNING_SIGNALS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        signals.add(category);
        break; // Only count each category once per message
      }
    }
  }

  return {
    signals: Array.from(signals),
    score: signals.size,
  };
}

/**
 * Score all messages by learning signals
 *
 * @param messages - Conversation messages to score
 * @returns Messages with signal scores and original indices
 */
export function scoreMessages(messages: ConversationMessage[]): ScoredMessage[] {
  return messages.map((msg, index) => {
    const { signals, score } = detectSignals(msg.content);
    return {
      ...msg,
      signals,
      signalScore: score,
      originalIndex: index,
    };
  });
}

/**
 * Sample messages to fit within token budget
 *
 * Strategy:
 * 1. Always include first N messages (context)
 * 2. Always include last N messages (recency)
 * 3. Fill remaining budget with highest-signal messages
 *
 * @param messages - All conversation messages
 * @param config - Sampling configuration
 * @returns Sampled messages in original order
 */
export function sampleMessages(
  messages: ConversationMessage[],
  config: Partial<SamplerConfig> = {}
): ScoredMessage[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Score all messages
  const scored = scoreMessages(messages);

  // Track which indices we've selected
  const selected = new Set<number>();
  let usedTokens = 0;

  // 1. Add context messages (first N)
  let contextTokens = 0;
  for (let i = 0; i < scored.length && i < cfg.minContextMessages; i++) {
    if (contextTokens + scored[i].tokens <= cfg.contextBudget) {
      selected.add(i);
      contextTokens += scored[i].tokens;
      usedTokens += scored[i].tokens;
    }
  }

  // 2. Add recency messages (last N)
  let recencyTokens = 0;
  for (let i = scored.length - 1; i >= 0 && (scored.length - i) <= cfg.minRecencyMessages; i--) {
    if (!selected.has(i) && recencyTokens + scored[i].tokens <= cfg.recencyBudget) {
      selected.add(i);
      recencyTokens += scored[i].tokens;
      usedTokens += scored[i].tokens;
    }
  }

  // 3. Fill remaining budget with high-signal messages
  const remainingBudget = cfg.maxTokens - usedTokens;

  // Get unselected messages sorted by signal score (descending)
  const unselected = scored
    .filter((_, i) => !selected.has(i))
    .sort((a, b) => {
      // Sort by signal score first, then prefer user messages
      if (b.signalScore !== a.signalScore) {
        return b.signalScore - a.signalScore;
      }
      // Prefer user messages (more likely to contain learnings)
      return a.role === 'user' ? -1 : 1;
    });

  let filledTokens = 0;
  for (const msg of unselected) {
    if (filledTokens + msg.tokens <= remainingBudget) {
      selected.add(msg.originalIndex);
      filledTokens += msg.tokens;
    }
  }

  // Return selected messages in original order
  return scored
    .filter((_, i) => selected.has(i))
    .sort((a, b) => a.originalIndex - b.originalIndex);
}

/**
 * Get sampling statistics
 */
export interface SamplingStats {
  totalMessages: number;
  sampledMessages: number;
  totalTokens: number;
  sampledTokens: number;
  messagesWithSignals: number;
  signalCounts: Record<string, number>;
}

/**
 * Calculate sampling statistics
 *
 * @param original - Original messages
 * @param sampled - Sampled messages
 * @returns Sampling statistics
 */
export function getSamplingStats(
  original: ConversationMessage[],
  sampled: ScoredMessage[]
): SamplingStats {
  const scored = scoreMessages(original);
  const messagesWithSignals = scored.filter((m) => m.signalScore > 0).length;

  const signalCounts: Record<string, number> = {
    preference: 0,
    decision: 0,
    correction: 0,
  };

  for (const msg of scored) {
    for (const signal of msg.signals) {
      signalCounts[signal] = (signalCounts[signal] || 0) + 1;
    }
  }

  return {
    totalMessages: original.length,
    sampledMessages: sampled.length,
    totalTokens: original.reduce((sum, m) => sum + estimateTokens(m.content), 0),
    sampledTokens: sampled.reduce((sum, m) => sum + m.tokens, 0),
    messagesWithSignals,
    signalCounts,
  };
}
