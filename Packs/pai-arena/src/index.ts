/**
 * PAI Arena - Multi-agent orchestration
 */

export { sendToClaude, generateSessionId, buildAgentPrompt } from './core/ClaudeCLI';
export { SessionManager } from './core/Session';
export { ArenaStore } from './storage/ArenaStore';
export type { ArenaSession, ArenaMessage, ArenaBudgetEntry } from './storage/ArenaStore';
export type { AgentState, AgentStatus, SessionState } from './core/Session';

// Integrations
export {
  MultiLLMBridge,
  createThinkTank,
  detectMultiLLM,
} from './integrations/MultiLLMBridge';
export type {
  ThinkTankConfig,
  ThinkResult,
  DebateResult,
  ProviderPerspective,
  MultiLLMStatus,
} from './integrations/MultiLLMBridge';
