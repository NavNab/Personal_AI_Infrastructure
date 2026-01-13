/**
 * Doer - Base class for specialized DOER agents
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { sendToClaude, buildAgentPrompt, ClaudeOptions } from './ClaudeCLI';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOERS_DIR = join(__dirname, '..', 'doers');

export interface DoerDefinition {
  id: string;
  name: string;
  identity: string;
  expertise: string[];
  style: string[];
  constraints: string[];
}

export interface DoerContext {
  mission: string;
  currentPhase: string;
  relatedWork: string[];
  directorInstructions: string;
}

/**
 * Load DOER definition from YAML
 */
export function loadDoerDefinition(doerType: string): DoerDefinition | null {
  const yamlPath = join(DOERS_DIR, `${doerType}.yaml`);

  if (!existsSync(yamlPath)) {
    return null;
  }

  const content = readFileSync(yamlPath, 'utf-8');
  return parseYaml(content) as DoerDefinition;
}

/**
 * Get all available DOER types
 */
export function getAvailableDoerTypes(): string[] {
  return [
    'architect',
    'backend',
    'frontend',
    'qa',
    'security',
    'docs',
    'researcher',
    'refactorer',
  ];
}

/**
 * Build DOER personality prompt from definition
 */
export function buildDoerPersonality(definition: DoerDefinition): string {
  let prompt = `# ${definition.name}\n\n`;
  prompt += `${definition.identity}\n\n`;

  prompt += `## Expertise\n`;
  for (const exp of definition.expertise) {
    prompt += `- ${exp}\n`;
  }
  prompt += '\n';

  prompt += `## Working Style\n`;
  for (const style of definition.style) {
    prompt += `- ${style}\n`;
  }
  prompt += '\n';

  prompt += `## Constraints\n`;
  for (const constraint of definition.constraints) {
    prompt += `- ${constraint}\n`;
  }

  return prompt;
}

/**
 * Build context-aware prompt for DOER
 */
export function buildDoerPrompt(
  definition: DoerDefinition,
  context: DoerContext,
  instruction: string
): string {
  const personality = buildDoerPersonality(definition);

  let contextStr = `## Mission\n${context.mission}\n\n`;
  contextStr += `## Current Phase\n${context.currentPhase}\n\n`;

  if (context.relatedWork.length > 0) {
    contextStr += `## Related Work from Other DOERs\n`;
    for (const work of context.relatedWork) {
      contextStr += `- ${work}\n`;
    }
    contextStr += '\n';
  }

  contextStr += `## DIRECTOR Instructions\n${context.directorInstructions}\n`;

  return buildAgentPrompt(
    definition.id,
    definition.name,
    personality,
    contextStr,
    instruction
  );
}

/**
 * Doer class - represents a specialized agent
 */
export class Doer {
  public readonly id: string;
  public readonly type: string;
  public readonly definition: DoerDefinition;
  private claudeSessionId: string;
  private isFirstMessage: boolean = true;

  constructor(type: string, claudeSessionId: string) {
    this.type = type;
    this.claudeSessionId = claudeSessionId;
    this.id = `doer-${type}`;

    const def = loadDoerDefinition(type);
    if (!def) {
      // Create default definition if YAML not found
      this.definition = {
        id: this.id,
        name: `DOER-${type.toUpperCase()}`,
        identity: `Specialized ${type} expert`,
        expertise: [`${type} domain expertise`],
        style: ['Professional', 'Thorough'],
        constraints: ['Stay within scope'],
      };
    } else {
      this.definition = def;
    }
  }

  /**
   * Execute a task
   */
  async execute(
    instruction: string,
    context: DoerContext
  ): Promise<{ content: string; success: boolean; error?: string }> {
    const prompt = buildDoerPrompt(this.definition, context, instruction);

    const options: ClaudeOptions = {
      sessionId: this.claudeSessionId,
      isFirst: this.isFirstMessage,
      dangerousMode: true,
    };

    const response = await sendToClaude(prompt, options);

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
   * Ask for clarification from DIRECTOR
   */
  buildClarificationRequest(question: string, context: string): string {
    return `[CLARIFICATION NEEDED from ${this.definition.name}]

Question: ${question}

Context: ${context}

Please provide guidance so I can proceed with the task.`;
  }

  /**
   * Challenge a DIRECTOR decision
   */
  buildChallenge(decision: string, reasoning: string): string {
    return `[CHALLENGE from ${this.definition.name}]

Decision being challenged: ${decision}

My reasoning: ${reasoning}

I'd like to discuss this before proceeding.`;
  }
}
