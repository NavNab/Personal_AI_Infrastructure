/**
 * Router - DIRECTOR-routed message passing between agents
 */

import { Director, DirectorContext, DirectorDecision } from './Director';
import { Doer, DoerContext, loadDoerDefinition } from './Doer';
import { SessionManager, AgentState } from './Session';
import { ArenaMessage } from '../storage/ArenaStore';

export type MessageType = ArenaMessage['type'];

export interface RoutedMessage {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  type: MessageType;
  content: string;
  directorComment?: string;
}

export interface RouterEvents {
  onMessage: (msg: RoutedMessage) => void;
  onAgentStateChange: (agentId: string, status: AgentState['status']) => void;
  onDecision: (decision: DirectorDecision) => void;
  onComplete: (reason: string) => void;
  onError: (error: string) => void;
}

/**
 * Router class - orchestrates agent communication
 */
export class Router {
  private sessionManager: SessionManager;
  private director: Director | null = null;
  private doers: Map<string, Doer> = new Map();
  private events: RouterEvents;
  private isRunning: boolean = false;
  private messageQueue: RoutedMessage[] = [];

  constructor(sessionManager: SessionManager, events: RouterEvents) {
    this.sessionManager = sessionManager;
    this.events = events;
  }

  /**
   * Initialize agents for the session
   */
  initialize(): void {
    const state = this.sessionManager.getState();
    if (!state) {
      throw new Error('No active session');
    }

    // Create DIRECTOR
    const directorState = state.agents.get('director');
    if (directorState) {
      this.director = new Director(directorState.sessionId, state.session.mission);
    }

    // Create DOERs
    for (const [id, agentState] of state.agents) {
      if (agentState.type === 'doer' && agentState.doerType) {
        const doer = new Doer(agentState.doerType, agentState.sessionId);
        this.doers.set(id, doer);
      }
    }
  }

  /**
   * Start the orchestration loop
   */
  async start(): Promise<void> {
    if (!this.director) {
      throw new Error('Director not initialized');
    }

    const state = this.sessionManager.getState();
    if (!state) {
      throw new Error('No active session');
    }

    this.isRunning = true;

    // Initial prompt to DIRECTOR
    const initialPrompt = `A new mission has started.

Mission: ${state.session.mission}

You have ${state.session.doers.length} DOERs available: ${state.session.doers.join(', ')}

Budget: ${state.session.budget} turns

Please analyze the mission and assign the first task to begin work.
Format your response with:
1. Brief mission analysis
2. Initial task assignment to a DOER
3. Clear instructions for that DOER`;

    await this.sendToDirector(initialPrompt);
  }

  /**
   * Stop the orchestration loop
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Send message to DIRECTOR
   */
  async sendToDirector(content: string, from?: string): Promise<void> {
    if (!this.director || !this.isRunning) return;

    const state = this.sessionManager.getState();
    if (!state) return;

    // Update agent state
    this.sessionManager.setActiveAgent('director');
    this.events.onAgentStateChange('director', 'active');

    // Build context
    const context: DirectorContext = {
      mission: state.session.mission,
      currentPhase: 'active',
      doers: new Map(
        Array.from(this.doers.entries()).map(([id, doer]) => [id, doer.definition])
      ),
      recentMessages: this.messageQueue.slice(-10).map((m) => ({
        from: m.from,
        content: m.content,
      })),
      taskBoard: [], // TODO: Integrate with TaskBoard
      turnsUsed: state.currentTurn,
      budget: state.session.budget,
    };

    // Get DIRECTOR response
    const response = await this.director.getNextAction(context, content);

    if (!response.success) {
      this.events.onError(response.error || 'DIRECTOR failed to respond');
      return;
    }

    // Record the turn
    this.sessionManager.recordTurn(
      'director',
      from || 'system',
      'response',
      response.content
    );

    // Create routed message
    const msg: RoutedMessage = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      from: 'director',
      to: from || 'system',
      type: 'response',
      content: response.content,
    };
    this.messageQueue.push(msg);
    this.events.onMessage(msg);

    // Update agent state
    this.sessionManager.updateAgentStatus('director', 'idle');
    this.events.onAgentStateChange('director', 'idle');

    // Check budget
    if (this.sessionManager.isBudgetExhausted()) {
      this.events.onComplete('Budget exhausted');
      this.isRunning = false;
      return;
    }

    // Parse decision and route to appropriate DOER
    const decision = this.director.parseDecision(response.content);
    if (decision) {
      this.events.onDecision(decision);

      if (decision.type === 'task-assignment' && decision.targetDoer) {
        await this.sendToDoer(decision.targetDoer, response.content);
      } else if (decision.type === 'completion') {
        this.events.onComplete(decision.reasoning);
        this.isRunning = false;
      }
    }
  }

  /**
   * Send message to a DOER
   */
  async sendToDoer(doerId: string, instruction: string): Promise<void> {
    const doer = this.doers.get(doerId);
    if (!doer || !this.isRunning) return;

    const state = this.sessionManager.getState();
    if (!state) return;

    // Update agent state
    this.sessionManager.setActiveAgent(doerId);
    this.events.onAgentStateChange(doerId, 'active');

    // Build context
    const context: DoerContext = {
      mission: state.session.mission,
      currentPhase: 'active',
      relatedWork: this.messageQueue
        .filter((m) => m.from.startsWith('doer-') && m.from !== doerId)
        .slice(-3)
        .map((m) => `${m.from}: ${m.content.slice(0, 100)}...`),
      directorInstructions: instruction,
    };

    // Execute task
    const response = await doer.execute(instruction, context);

    if (!response.success) {
      this.events.onError(response.error || `${doerId} failed to respond`);
      return;
    }

    // Record the turn
    this.sessionManager.recordTurn(doerId, 'director', 'response', response.content);

    // Create routed message
    const msg: RoutedMessage = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      from: doerId,
      to: 'director',
      type: 'response',
      content: response.content,
    };
    this.messageQueue.push(msg);
    this.events.onMessage(msg);

    // Update agent state
    this.sessionManager.updateAgentStatus(doerId, 'idle');
    this.events.onAgentStateChange(doerId, 'idle');

    // Check budget
    if (this.sessionManager.isBudgetExhausted()) {
      this.events.onComplete('Budget exhausted');
      this.isRunning = false;
      return;
    }

    // Route response back to DIRECTOR for next decision
    await this.sendToDirector(
      `Response from ${doer.definition.name}:\n\n${response.content}\n\nWhat's the next step?`,
      doerId
    );
  }

  /**
   * Handle DOER challenge to DIRECTOR
   */
  async handleChallenge(doerId: string, challenge: string): Promise<void> {
    const doer = this.doers.get(doerId);
    if (!doer) return;

    const formattedChallenge = doer.buildChallenge(
      'DIRECTOR decision',
      challenge
    );

    await this.sendToDirector(formattedChallenge, doerId);
  }

  /**
   * Handle DOER clarification request
   */
  async handleClarificationRequest(doerId: string, question: string, context: string): Promise<void> {
    const doer = this.doers.get(doerId);
    if (!doer) return;

    const request = doer.buildClarificationRequest(question, context);
    await this.sendToDirector(request, doerId);
  }

  /**
   * Get message history
   */
  getMessageHistory(): RoutedMessage[] {
    return [...this.messageQueue];
  }

  /**
   * Check if router is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
