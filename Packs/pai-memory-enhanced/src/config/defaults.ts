/**
 * Configuration defaults for pai-memory-enhanced
 *
 * Enhanced memory system with hypothesis validation, confidence scoring,
 * and cross-LLM export capabilities.
 * Storage: $PAI_DIR/MEMORY/
 */

import { join } from 'path';
import { homedir } from 'os';

/**
 * Resolve PAI_DIR following PAI conventions:
 * 1. Use PAI_DIR env var if set
 * 2. Fall back to ~/.claude
 */
export function getPaiDir(): string {
  return process.env.PAI_DIR || join(homedir(), '.claude');
}

/**
 * Get the MEMORY directory path
 * This is where PAI stores all memory-related data
 */
export function getMemoryDir(): string {
  return join(getPaiDir(), 'MEMORY');
}

export interface Config {
  /** PAI directory (from PAI_DIR env or ~/.claude) */
  paiDir: string;

  /** MEMORY directory ($PAI_DIR/MEMORY/) */
  memoryDir: string;

  /** Default hypothesis expiry in days */
  defaultExpiryDays: number;

  /** Observations needed to promote hypothesis → fact */
  promotionThreshold: number;

  /** Whether to mark as 'closed' (true) or 'expired' (false) on expiry */
  closeOnExpiry: boolean;

  /** Minimum confidence for export (1.0 = only promoted facts) */
  defaultConfidenceThreshold: number;

  /** Export format version */
  exportVersion: string;

  /** Environment variable names for multi-LLM tracking */
  envVars: {
    sessionId: string;
    userAgent: string;
    modelId: string;
    llmProvider: string;
  };
}

export const CONFIG: Config = {
  // PAI paths - integrated into existing PAI structure
  paiDir: getPaiDir(),
  memoryDir: getMemoryDir(),

  // Hypothesis settings
  defaultExpiryDays: 7,
  promotionThreshold: 5, // 5 observations to promote

  // Sweep settings
  closeOnExpiry: true,

  // Export settings
  defaultConfidenceThreshold: 1.0,
  exportVersion: '2.0',

  // Environment variable names for multi-LLM tracking
  envVars: {
    sessionId: 'PAI_SESSION_ID',
    userAgent: 'PAI_USER_AGENT',
    modelId: 'PAI_MODEL_ID',
    llmProvider: 'PAI_LLM_PROVIDER',
  },
};

/**
 * Create config with overrides
 */
export function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...CONFIG,
    paiDir: getPaiDir(),
    memoryDir: getMemoryDir(),
    ...overrides,
  };
}

/**
 * Get paths for memory-enhanced files within PAI MEMORY
 * These files ADD to PAI MEMORY, they don't replace it
 */
export function getMemoryPaths() {
  const memoryDir = getMemoryDir();
  return {
    // Enhanced memory files
    hypothesesFile: join(memoryDir, 'hypotheses.jsonl'),
    factsFile: join(memoryDir, 'validated-facts.jsonl'),
    cuesFile: join(memoryDir, 'cues.json'),
    auditFile: join(memoryDir, 'audit.jsonl'),

    // Use existing PAI MEMORY directories
    sessionsDir: join(memoryDir, 'sessions'),
    researchDir: join(memoryDir, 'research'),
    learningsDir: join(memoryDir, 'learnings'),
    stateDir: join(memoryDir, 'State'),
  };
}

// Alias for backwards compatibility
export const basePath = getMemoryDir();
