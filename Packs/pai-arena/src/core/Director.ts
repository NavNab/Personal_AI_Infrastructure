/**
 * Director - Adaptive coordinator for arena sessions
 */

import { sendToClaude, buildAgentPrompt, ClaudeOptions } from './ClaudeCLI';
import { Doer, DoerDefinition } from './Doer';

export type DirectorStyle = 'tech-lead' | 'project-manager' | 'socratic' | 'adaptive';

export interface DirectorDecision {
  type: 'task-assignment' | 'clarification' | 'conflict-resolution' | 'phase-transition' | 'completion';
  targetDoer?: string;
  instruction?: string;
  ruling?: string;
  reasoning: string;
}

export interface DirectorContext {
  mission: string;
  currentPhase: string;
  doers: Map<string, DoerDefinition>;
  recentMessages: Array<{ from: string; content: string }>;
  taskBoard: Array<{ task: string; assignee: string; status: string }>;
  turnsUsed: number;
  budget: number;
}

/**
 * Determine DIRECTOR style based on mission type
 */
export function determineStyle(mission: string): DirectorStyle {
  const missionLower = mission.toLowerCase();

  if (missionLower.includes('build') || missionLower.includes('implement') || missionLower.includes('create')) {
    return 'tech-lead';
  }
  if (missionLower.includes('research') || missionLower.includes('explore') || missionLower.includes('investigate')) {
    return 'socratic';
  }
  if (missionLower.includes('review') || missionLower.includes('audit') || missionLower.includes('fix')) {
    return 'project-manager';
  }
  return 'adaptive';
}

/**
 * Build DIRECTOR personality based on style
 */
function buildDirectorPersonality(style: DirectorStyle): string {
  const base = `You are the DIRECTOR - the coordinator of a multi-agent team.
Your role is to:
1. Assign tasks to specialized DOERs
2. Route messages between DOERs (they communicate through you)
3. Resolve conflicts and make decisions
4. Track progress and adjust plans as needed

You have authority, but DOERs can challenge your decisions with good reasoning.
Always explain your rationale for task assignments and decisions.
`;

  switch (style) {
    case 'tech-lead':
      return base + `
## Your Style: Tech Lead
- Focus on technical quality and architecture
- Ensure code follows best practices
- Challenge weak designs constructively
- Delegate implementation but review approaches
- "Let's make sure we're building this right"
`;

    case 'project-manager':
      return base + `
## Your Style: Project Manager
- Focus on progress and deliverables
- Keep the team moving forward
- Identify and remove blockers quickly
- Balance scope with available time
- "What's blocking us? How can we ship faster?"
`;

    case 'socratic':
      return base + `
## Your Style: Socratic Guide
- Ask questions to guide understanding
- Let DOERs discover solutions themselves
- Encourage exploration before commitment
- Validate assumptions through inquiry
- "What if we approached this differently?"
`;

    case 'adaptive':
    default:
      return base + `
## Your Style: Adaptive
- Read the situation and adjust your approach
- Tech lead for complex builds
- Project manager when progress stalls
- Socratic for research and exploration
- Match your style to what the team needs now
`;
  }
}

/**
 * Director class - coordinates the arena
 */
export class Director {
  public readonly id = 'director';
  private claudeSessionId: string;
  private style: DirectorStyle;
  private isFirstMessage: boolean = true;

  constructor(claudeSessionId: string, mission: string) {
    this.claudeSessionId = claudeSessionId;
    this.style = determineStyle(mission);
  }

  /**
   * Get current style
   */
  getStyle(): DirectorStyle {
    return this.style;
  }

  /**
   * Build context summary for DIRECTOR
   */
  private buildContextSummary(context: DirectorContext): string {
    let summary = `## Mission\n${context.mission}\n\n`;
    summary += `## Current Phase\n${context.currentPhase}\n\n`;
    summary += `## Budget\n${context.turnsUsed}/${context.budget} turns used\n\n`;

    summary += `## Available DOERs\n`;
    for (const [id, def] of context.doers) {
      summary += `- ${def.name}: ${def.identity.split('\n')[0]}\n`;
    }
    summary += '\n';

    if (context.taskBoard.length > 0) {
      summary += `## Task Board\n`;
      for (const task of context.taskBoard) {
        summary += `- [${task.status}] ${task.task} (${task.assignee})\n`;
      }
      summary += '\n';
    }

    if (context.recentMessages.length > 0) {
      summary += `## Recent Activity\n`;
      for (const msg of context.recentMessages.slice(-5)) {
        const preview = msg.content.slice(0, 100).replace(/\n/g, ' ');
        summary += `- ${msg.from}: ${preview}${msg.content.length > 100 ? '...' : ''}\n`;
      }
    }

    return summary;
  }

  /**
   * Get next action from DIRECTOR
   */
  async getNextAction(
    context: DirectorContext,
    prompt: string
  ): Promise<{ content: string; success: boolean; error?: string }> {
    const personality = buildDirectorPersonality(this.style);
    const contextSummary = this.buildContextSummary(context);

    const fullPrompt = buildAgentPrompt(
      this.id,
      'DIRECTOR',
      personality,
      contextSummary,
      prompt
    );

    const options: ClaudeOptions = {
      sessionId: this.claudeSessionId,
      isFirst: this.isFirstMessage,
      dangerousMode: true,
    };

    const response = await sendToClaude(fullPrompt, options);

    if (response.success) {
      this.isFirstMessage = false;
    }

    return {
      content: response.content,
      success: response.success,
      error: response.error,
    };
  }

  /**
   * Parse DIRECTOR response for structured decisions
   */
  parseDecision(response: string): DirectorDecision | null {
    // Look for task assignment pattern
    if (response.includes('[TASK]') || response.includes('assign') || response.includes('DOER-')) {
      const doerMatch = response.match(/DOER-(\w+)/i);
      return {
        type: 'task-assignment',
        targetDoer: doerMatch ? `doer-${doerMatch[1].toLowerCase()}` : undefined,
        instruction: response,
        reasoning: 'Parsed from DIRECTOR response',
      };
    }

    // Look for clarification request
    if (response.includes('[CLARIFICATION]') || response.includes('need more information')) {
      return {
        type: 'clarification',
        reasoning: response,
      };
    }

    // Look for conflict resolution
    if (response.includes('[DECISION]') || response.includes('I\'ve decided')) {
      return {
        type: 'conflict-resolution',
        ruling: response,
        reasoning: 'Director ruling',
      };
    }

    // Look for completion
    if (response.includes('[COMPLETE]') || response.includes('mission accomplished')) {
      return {
        type: 'completion',
        reasoning: response,
      };
    }

    return null;
  }

  /**
   * Route a message from one DOER to another
   */
  buildRoutedMessage(
    from: string,
    to: string,
    originalMessage: string,
    directorComment?: string
  ): string {
    let routed = `[ROUTED MESSAGE]\nFrom: ${from}\nTo: ${to}\n\n`;
    routed += `--- Original Message ---\n${originalMessage}\n--- End Message ---\n\n`;

    if (directorComment) {
      routed += `[DIRECTOR Note]: ${directorComment}\n`;
    }

    return routed;
  }
}
