/**
 * Environment Variable Reader - Multi-LLM support
 *
 * Reads PAI environment variables for cross-LLM tracking.
 */

import { CONFIG } from '../config/defaults';

export interface LLMEnvironment {
  sessionId: string | null;
  userAgent: string | null;
  modelId: string | null;
  llmProvider: string | null;
}

export function readLLMEnvironment(): LLMEnvironment {
  return {
    sessionId: process.env[CONFIG.envVars.sessionId] || null,
    userAgent: process.env[CONFIG.envVars.userAgent] || null,
    modelId: process.env[CONFIG.envVars.modelId] || null,
    llmProvider: process.env[CONFIG.envVars.llmProvider] || null,
  };
}

export function getSourceModel(): string {
  const env = readLLMEnvironment();
  return env.modelId || env.userAgent || 'unknown';
}

export function getSourceProvider(): string {
  const env = readLLMEnvironment();
  return env.llmProvider || 'unknown';
}

export function getSessionId(): string {
  const env = readLLMEnvironment();
  return env.sessionId || `pai-${Date.now()}`;
}
