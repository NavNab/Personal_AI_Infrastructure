/**
 * Session - Arena session management
 */

import { generateSessionId } from './ClaudeCLI';
import { ArenaStore, ArenaSession, ArenaMessage, ArenaBudgetEntry } from '../storage/ArenaStore';

export type AgentStatus = 'idle' | 'waiting' | 'active' | 'blocked';

export interface AgentState {
  id: string;
  type: 'director' | 'doer';
  doerType?: string;
  status: AgentStatus;
  sessionId: string; // Claude session ID for this agent
  turnsUsed: number;
  turnsAllocated: number;
  currentTask?: string;
}

export interface SessionState {
  session: ArenaSession;
  agents: Map<string, AgentState>;
  currentTurn: number;
  activeAgent: string | null;
}

export class SessionManager {
  private store: ArenaStore;
  private state: SessionState | null = null;

  constructor() {
    this.store = new ArenaStore();
  }

  /**
   * Start a new arena session
   */
  start(mission: string, doerTypes: string[], budget: number = 1000): SessionState {
    const sessionId = generateSessionId();

    // Create session in store
    const session = this.store.createSession(sessionId, mission, doerTypes, budget);

    // Initialize agents
    const agents = new Map<string, AgentState>();

    // Create DIRECTOR
    agents.set('director', {
      id: 'director',
      type: 'director',
      status: 'idle',
      sessionId: generateSessionId(),
      turnsUsed: 0,
      turnsAllocated: Math.floor(budget * 0.2), // 20% for DIRECTOR
    });

    // Create DOERs
    const doerBudget = Math.floor((budget * 0.8) / doerTypes.length);
    for (const doerType of doerTypes) {
      const doerId = `doer-${doerType}`;
      agents.set(doerId, {
        id: doerId,
        type: 'doer',
        doerType,
        status: 'idle',
        sessionId: generateSessionId(),
        turnsUsed: 0,
        turnsAllocated: doerBudget,
      });
    }

    this.state = {
      session,
      agents,
      currentTurn: 0,
      activeAgent: null,
    };

    return this.state;
  }

  /**
   * Resume an existing session
   */
  resume(sessionId: string): SessionState | null {
    const session = this.store.getSession(sessionId);
    if (!session || session.status === 'completed') {
      return null;
    }

    // Rebuild agent state from messages
    const messages = this.store.getMessages(sessionId);
    const agents = new Map<string, AgentState>();

    // Recreate DIRECTOR
    agents.set('director', {
      id: 'director',
      type: 'director',
      status: 'idle',
      sessionId: generateSessionId(), // New Claude session for resume
      turnsUsed: messages.filter((m) => m.from === 'director').length,
      turnsAllocated: Math.floor(session.budget * 0.2),
    });

    // Recreate DOERs
    const doerBudget = Math.floor((session.budget * 0.8) / session.doers.length);
    for (const doerType of session.doers) {
      const doerId = `doer-${doerType}`;
      agents.set(doerId, {
        id: doerId,
        type: 'doer',
        doerType,
        status: 'idle',
        sessionId: generateSessionId(),
        turnsUsed: messages.filter((m) => m.from === doerId).length,
        turnsAllocated: doerBudget,
      });
    }

    // Update session status
    this.store.updateSession(sessionId, { status: 'running' });

    this.state = {
      session: { ...session, status: 'running' },
      agents,
      currentTurn: session.turnsUsed,
      activeAgent: null,
    };

    return this.state;
  }

  /**
   * Get current state
   */
  getState(): SessionState | null {
    return this.state;
  }

  /**
   * Set active agent
   */
  setActiveAgent(agentId: string): void {
    if (!this.state) return;

    // Set previous active to idle
    if (this.state.activeAgent) {
      const prev = this.state.agents.get(this.state.activeAgent);
      if (prev) {
        prev.status = 'idle';
      }
    }

    // Set new active
    const agent = this.state.agents.get(agentId);
    if (agent) {
      agent.status = 'active';
      this.state.activeAgent = agentId;
    }
  }

  /**
   * Record a turn
   */
  recordTurn(
    from: string,
    to: string,
    type: ArenaMessage['type'],
    content: string
  ): void {
    if (!this.state) return;

    const message: ArenaMessage = {
      timestamp: new Date().toISOString(),
      from,
      to,
      type,
      content,
    };

    this.store.appendMessage(this.state.session.id, message);

    // Update turn counts
    this.state.currentTurn++;
    const agent = this.state.agents.get(from);
    if (agent) {
      agent.turnsUsed++;
    }

    // Update session
    this.store.updateSession(this.state.session.id, {
      turnsUsed: this.state.currentTurn,
    });
  }

  /**
   * Record a DIRECTOR decision
   */
  recordDecision(issue: string, ruling: string, context: string): void {
    if (!this.state) return;

    this.store.appendDecision(this.state.session.id, {
      timestamp: new Date().toISOString(),
      issue,
      ruling,
      context,
    });
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: AgentStatus, task?: string): void {
    if (!this.state) return;

    const agent = this.state.agents.get(agentId);
    if (agent) {
      agent.status = status;
      if (task !== undefined) {
        agent.currentTask = task;
      }
    }
  }

  /**
   * Check if budget is exhausted
   */
  isBudgetExhausted(): boolean {
    if (!this.state) return true;
    return this.state.currentTurn >= this.state.session.budget;
  }

  /**
   * Complete the session
   */
  complete(status: 'completed' | 'failed' = 'completed'): void {
    if (!this.state) return;

    // Update budget report
    const entries: ArenaBudgetEntry[] = [];
    for (const [id, agent] of this.state.agents) {
      entries.push({
        agentId: id,
        turnsUsed: agent.turnsUsed,
        turnsAllocated: agent.turnsAllocated,
      });
    }
    this.store.updateBudget(this.state.session.id, entries);

    // Update session status
    this.store.updateSession(this.state.session.id, { status });
  }

  /**
   * Export session to markdown
   */
  export(): string {
    if (!this.state) return '';
    return this.store.exportToMarkdown(this.state.session.id);
  }

  /**
   * Get all sessions
   */
  listSessions(): ArenaSession[] {
    return this.store.listSessions();
  }
}
