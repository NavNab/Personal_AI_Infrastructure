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
  multiLLMBridge,
  think,
  debate,
  isMultiLLMAvailable,
} from './integrations';
export type {
  MultiLLMStatus,
  ProviderResponse,
  ThinkResult,
  DebateResult,
  DebateRound,
  BridgeConfig,
} from './integrations';
