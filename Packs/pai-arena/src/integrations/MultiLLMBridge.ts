/**
 * MultiLLMBridge - Text-only adapter for Arena DIRECTOR to consult multiple LLMs
 *
 * This bridge allows the DIRECTOR to gather cognitive diversity from multiple
 * LLM providers BEFORE making strategic decisions. DOERs remain Claude-only
 * in dangerous mode.
 *
 * CRITICAL CONSTRAINTS:
 * - TEXT-ONLY queries (stdin/stdout)
 * - NO tools, NO MCPs, NO permissions
 * - NO breaking dangerous mode flow
 * - Graceful fallback to Claude-only if MultiLLM not installed
 *
 * Architecture:
 *   ARENA Mission Running
 *          |
 *          v
 *   DIRECTOR hits strategic decision
 *   "JWT vs Sessions? Which library?"
 *          |
 *          v
 *   +-------------------------------------+
 *   | MultiLLMBridge (TEXT-ONLY)          |
 *   |                                     |
 *   | -> Claude: "JWT for stateless..."   |
 *   | -> Gemini: "Consider refresh..."    |
 *   | -> Codex: "Use proven library..."   |
 *   |                                     |
 *   | -> Synthesis returned to DIRECTOR   |
 *   +-------------------------------------+
 *          |
 *          v
 *   DIRECTOR decides, DOERs execute
 *   (Claude dangerous mode, uninterrupted)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { $ } from 'bun';

// MultiLLM detection result
export interface MultiLLMStatus {
  available: boolean;
  providers: string[];
  teamFilePath: string;
}

// Provider response
export interface ProviderResponse {
  provider: string;
  response: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

// Think result - single strategic question
export interface ThinkResult {
  question: string;
  providers: string[];
  responses: ProviderResponse[];
  synthesis: string;
  fallbackUsed: boolean;
  durationMs: number;
}

// Debate round
export interface DebateRound {
  roundNumber: number;
  topic: string;
  responses: ProviderResponse[];
}

// Debate result - multi-round perspective gathering
export interface DebateResult {
  topic: string;
  rounds: DebateRound[];
  synthesis: string;
  providers: string[];
  fallbackUsed: boolean;
  durationMs: number;
}

// Bridge configuration
export interface BridgeConfig {
  paiDir: string;
  timeout: number; // ms per provider
  maxParallel: number; // max concurrent queries
  preferredProviders?: string[]; // order preference
}

const DEFAULT_CONFIG: BridgeConfig = {
  paiDir: process.env.PAI_DIR || join(process.env.HOME || '', '.claude'),
  timeout: 30000, // 30s
  maxParallel: 3,
};

/**
 * MultiLLMBridge class
 *
 * Provides cognitive diversity for DIRECTOR strategic decisions
 * without breaking dangerous mode flow for DOERs.
 */
export class MultiLLMBridge {
  private config: BridgeConfig;
  private multiLLMStatus: MultiLLMStatus | null = null;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect if MultiLLM pack is installed and configured
   */
  detectMultiLLM(): MultiLLMStatus {
    if (this.multiLLMStatus) {
      return this.multiLLMStatus;
    }

    const teamFilePath = join(this.config.paiDir, 'config', 'team.yaml');

    if (!existsSync(teamFilePath)) {
      this.multiLLMStatus = {
        available: false,
        providers: [],
        teamFilePath,
      };
      return this.multiLLMStatus;
    }

    try {
      const content = readFileSync(teamFilePath, 'utf-8');

      // Parse YAML for provider names and availability
      const providers: string[] = [];

      // Match provider blocks - handle both quoted and unquoted YAML keys
      // Format: - "name": "claude" or - name: claude (with optional indentation)
      const providerBlocks = content.split(/^\s*-\s+"?name"?:/m).slice(1);

      for (const block of providerBlocks) {
        // Extract name (handles: "claude" or claude)
        const nameMatch = block.match(/^\s*"?(\w+)"?/);
        // Extract available (handles: "available": true or available: true)
        const availableMatch = block.match(/"?available"?:\s*(true|false)/i);

        if (nameMatch && availableMatch && availableMatch[1] === 'true') {
          providers.push(nameMatch[1]);
        }
      }

      this.multiLLMStatus = {
        available: providers.length > 0,
        providers,
        teamFilePath,
      };
    } catch (error) {
      this.multiLLMStatus = {
        available: false,
        providers: [],
        teamFilePath,
      };
    }

    return this.multiLLMStatus;
  }

  /**
   * Query a single provider with TEXT-ONLY prompt
   * Uses shell command - no tools, no MCPs, no permissions
   */
  private async queryProvider(
    provider: string,
    prompt: string
  ): Promise<ProviderResponse> {
    const startTime = Date.now();

    try {
      let shellPromise;

      // Use Bun shell directly with proper argument passing
      switch (provider.toLowerCase()) {
        case 'claude':
          shellPromise = $`claude -p ${prompt}`.quiet();
          break;
        case 'codex':
          shellPromise = $`codex -p ${prompt}`.quiet();
          break;
        case 'gemini':
          shellPromise = $`gemini -p ${prompt}`.quiet();
          break;
        case 'ollama':
          shellPromise = $`ollama run llama3.2 ${prompt}`.quiet();
          break;
        case 'opencode':
          shellPromise = $`opencode ask ${prompt}`.quiet();
          break;
        default:
          // Generic fallback
          shellPromise = $`${provider} -p ${prompt}`.quiet();
      }

      // Add timeout using Promise.race
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), this.config.timeout);
      });

      const result = await Promise.race([shellPromise, timeoutPromise]);

      return {
        provider,
        response: result.stdout.toString().trim(),
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        provider,
        response: '',
        success: false,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Query Claude only (fallback when MultiLLM not available)
   */
  private async queryClaudeOnly(prompt: string): Promise<ProviderResponse> {
    return this.queryProvider('claude', prompt);
  }

  /**
   * Synthesize multiple provider responses into a unified insight
   */
  private synthesizeResponses(
    question: string,
    responses: ProviderResponse[]
  ): string {
    const successful = responses.filter((r) => r.success);

    if (successful.length === 0) {
      return 'No providers responded successfully.';
    }

    if (successful.length === 1) {
      return successful[0].response;
    }

    // Build synthesis from multiple perspectives
    const lines = [
      `## Multi-LLM Synthesis for: "${question.slice(0, 50)}..."`,
      '',
    ];

    // Add each provider's perspective
    for (const r of successful) {
      lines.push(`### ${r.provider.toUpperCase()} Perspective`);
      lines.push(r.response.slice(0, 500));
      lines.push('');
    }

    // Add common themes if multiple providers
    if (successful.length >= 2) {
      lines.push('### Key Themes Across Providers');

      // Simple keyword extraction for common themes
      const allWords = successful
        .map((r) => r.response.toLowerCase())
        .join(' ')
        .split(/\W+/)
        .filter((w) => w.length > 4);

      const wordCounts = new Map<string, number>();
      for (const word of allWords) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }

      const commonWords = Array.from(wordCounts.entries())
        .filter(([_, count]) => count >= successful.length)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

      if (commonWords.length > 0) {
        lines.push(`Common concepts: ${commonWords.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Think - Query multiple providers for a single strategic question
   *
   * Use this when DIRECTOR needs cognitive diversity before a decision.
   * Returns synthesized insights from all available providers.
   *
   * @param question - Strategic question to ask
   * @param options - Optional configuration
   */
  async think(
    question: string,
    options: { maxProviders?: number; timeoutMs?: number } = {}
  ): Promise<ThinkResult> {
    const startTime = Date.now();
    const { maxProviders = this.config.maxParallel, timeoutMs = this.config.timeout } = options;

    // Detect MultiLLM availability
    const status = this.detectMultiLLM();

    let responses: ProviderResponse[];
    let providersUsed: string[];
    let fallbackUsed = false;

    if (status.available) {
      // Query multiple providers in parallel
      const providers = this.config.preferredProviders?.length
        ? this.config.preferredProviders.slice(0, maxProviders)
        : status.providers.slice(0, maxProviders);

      providersUsed = providers;

      const queries = providers.map((p) => this.queryProvider(p, question));
      responses = await Promise.all(queries);
    } else {
      // Fallback to Claude-only
      fallbackUsed = true;
      providersUsed = ['claude'];
      responses = [await this.queryClaudeOnly(question)];
    }

    const synthesis = this.synthesizeResponses(question, responses);

    return {
      question,
      providers: providersUsed,
      responses,
      synthesis,
      fallbackUsed,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Debate - Multi-round discussion for complex decisions
   *
   * Use this when DIRECTOR faces a complex architectural or strategic
   * decision that benefits from back-and-forth perspective gathering.
   *
   * @param topic - Topic to debate
   * @param rounds - Number of debate rounds (default: 2)
   * @param options - Optional configuration
   */
  async debate(
    topic: string,
    rounds: number = 2,
    options: { maxProviders?: number } = {}
  ): Promise<DebateResult> {
    const startTime = Date.now();
    const { maxProviders = this.config.maxParallel } = options;

    // Detect MultiLLM availability
    const status = this.detectMultiLLM();

    const debateRounds: DebateRound[] = [];
    let providersUsed: string[];
    let fallbackUsed = false;

    if (status.available) {
      providersUsed = this.config.preferredProviders?.length
        ? this.config.preferredProviders.slice(0, maxProviders)
        : status.providers.slice(0, maxProviders);
    } else {
      fallbackUsed = true;
      providersUsed = ['claude'];
    }

    // Build context from previous rounds
    let previousContext = '';

    for (let i = 1; i <= rounds; i++) {
      const roundPrompt = this.buildDebatePrompt(topic, i, previousContext, providersUsed);

      let responses: ProviderResponse[];
      if (fallbackUsed) {
        responses = [await this.queryClaudeOnly(roundPrompt)];
      } else {
        const queries = providersUsed.map((p) => this.queryProvider(p, roundPrompt));
        responses = await Promise.all(queries);
      }

      debateRounds.push({
        roundNumber: i,
        topic,
        responses,
      });

      // Build context for next round
      previousContext = responses
        .filter((r) => r.success)
        .map((r) => `${r.provider}: ${r.response.slice(0, 300)}`)
        .join('\n\n');
    }

    // Final synthesis
    const allResponses = debateRounds.flatMap((r) => r.responses);
    const synthesis = this.synthesizeDebate(topic, debateRounds);

    return {
      topic,
      rounds: debateRounds,
      synthesis,
      providers: providersUsed,
      fallbackUsed,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Build debate prompt for a specific round
   */
  private buildDebatePrompt(
    topic: string,
    round: number,
    previousContext: string,
    providers: string[]
  ): string {
    if (round === 1) {
      return `You are participating in a strategic discussion about: "${topic}"

This is Round 1 of a multi-round debate. Other AI models are also participating.

Share your initial perspective on this topic. Consider:
- Key factors to evaluate
- Potential risks and benefits
- Your recommended approach

Be concise but thorough. Your input will be synthesized with other perspectives.`;
    }

    return `You are participating in a strategic discussion about: "${topic}"

This is Round ${round}. Here are perspectives from the previous round:

${previousContext}

Based on these perspectives, provide your refined view:
- Do you agree or disagree with specific points?
- What nuances or considerations are missing?
- What is your updated recommendation?

Be concise and focus on adding value to the discussion.`;
  }

  /**
   * Synthesize multi-round debate into actionable insights
   */
  private synthesizeDebate(topic: string, rounds: DebateRound[]): string {
    const lines = [
      `## Debate Synthesis: "${topic.slice(0, 50)}..."`,
      '',
    ];

    // Summarize each round
    for (const round of rounds) {
      lines.push(`### Round ${round.roundNumber}`);
      const successful = round.responses.filter((r) => r.success);
      for (const r of successful) {
        lines.push(`**${r.provider}**: ${r.response.slice(0, 200)}...`);
      }
      lines.push('');
    }

    // Final recommendation
    lines.push('### Key Takeaways');

    const lastRound = rounds[rounds.length - 1];
    const finalResponses = lastRound.responses.filter((r) => r.success);

    if (finalResponses.length > 0) {
      lines.push('The final round converged on these points:');
      for (const r of finalResponses) {
        const firstSentence = r.response.split('.')[0];
        lines.push(`- ${r.provider}: ${firstSentence}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Quick check if MultiLLM is available
   */
  isAvailable(): boolean {
    return this.detectMultiLLM().available;
  }

  /**
   * Get list of available providers
   */
  getProviders(): string[] {
    return this.detectMultiLLM().providers;
  }
}

// Export singleton instance for easy use
export const multiLLMBridge = new MultiLLMBridge();

// Export convenience functions
export function think(question: string): Promise<ThinkResult> {
  return multiLLMBridge.think(question);
}

export function debate(topic: string, rounds?: number): Promise<DebateResult> {
  return multiLLMBridge.debate(topic, rounds);
}

export function isMultiLLMAvailable(): boolean {
  return multiLLMBridge.isAvailable();
}
