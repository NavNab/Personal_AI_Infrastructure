/**
 * ClaudeCLI - Wrapper for spawning Claude CLI processes
 */

import { $ } from 'bun';

export interface ClaudeResponse {
  content: string;
  raw: string;
  success: boolean;
  error?: string;
}

export interface ClaudeOptions {
  sessionId: string;
  isFirst: boolean;
  dangerousMode?: boolean;
  outputFormat?: 'text' | 'json' | 'stream-json';
}

/**
 * Clean Claude response by removing system artifacts
 */
function cleanResponse(raw: string): string {
  let cleaned = raw;

  // Remove system reminders
  cleaned = cleaned.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');

  // Remove voice output lines
  cleaned = cleaned.replace(/^.*🗣️.*$/gm, '');

  // Remove summary blocks
  cleaned = cleaned.replace(/^📋 SUMMARY:.*$/gm, '');
  cleaned = cleaned.replace(/^🔍 ANALYSIS:.*$/gm, '');
  cleaned = cleaned.replace(/^⚡ ACTIONS:.*$/gm, '');
  cleaned = cleaned.replace(/^✅ RESULTS:.*$/gm, '');
  cleaned = cleaned.replace(/^➡️ NEXT:.*$/gm, '');

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Send a message to Claude CLI
 */
export async function sendToClaude(
  message: string,
  options: ClaudeOptions
): Promise<ClaudeResponse> {
  const { sessionId, isFirst, dangerousMode = true, outputFormat = 'text' } = options;

  const args: string[] = [];

  // First message creates new session, subsequent resume
  if (isFirst) {
    args.push('-p', message, '--session-id', sessionId);
  } else {
    args.push('-p', message, '-r', sessionId);
  }

  // Output format
  args.push('--output-format', outputFormat);

  // Dangerous mode for autonomous operation
  if (dangerousMode) {
    args.push('--dangerously-skip-permissions');
  }

  try {
    const result = await $`claude ${args}`.text();
    const content = cleanResponse(result);

    return {
      content,
      raw: result,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: '',
      raw: '',
      success: false,
      error: `Claude CLI failed: ${errorMessage}`,
    };
  }
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Build a system prompt for an agent
 */
export function buildAgentPrompt(
  agentId: string,
  agentName: string,
  personality: string,
  context: string,
  instruction: string
): string {
  return `You are ${agentName} (ID: ${agentId}).

${personality}

## Current Context
${context}

## Your Task
${instruction}

Respond concisely and stay in character.`;
}
