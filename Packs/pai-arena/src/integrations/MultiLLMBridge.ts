/**
 * MultiLLMBridge - Text-only adapter for Arena's Think Tank
 *
 * Provides cognitive diversity for DIRECTOR's strategic decisions.
 * CRITICAL: All queries are TEXT-ONLY. No tools, no MCPs, no permission prompts.
 *
 * Arena runs in dangerous mode (fully autonomous). If MultiLLM queries trigger
 * permission prompts, it breaks the entire flow.
 */

import { existsSync, readFileSync } from 'fs';
import { $ } from 'bun';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ThinkTankConfig {
  /** Maximum time to wait for a provider response (ms) */
  timeout: number;
  /** Whether to run queries in parallel */
  parallel: boolean;
  /** Preferred providers for think tank queries */
  preferredProviders: string[];
  /** Default to Claude-only if MultiLLM unavailable */
  claudeFallback: boolean;
}

export interface ProviderPerspective {
  provider: string;
  response: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface ThinkResult {
  question: string;
  perspectives: ProviderPerspective[];
  synthesis?: string;
  totalDurationMs: number;
  providersQueried: number;
  providersResponded: number;
}

export interface DebateResult {
  topic: string;
  rounds: Array<{
    round: number;
    perspectives: ProviderPerspective[];
  }>;
  synthesis: string;
  conclusion: string;
  totalDurationMs: number;
}

export interface MultiLLMStatus {
  available: boolean;
  teamFile?: string;
  providers: string[];
  error?: string;
}

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const PAI_DIR = process.env.PAI_DIR || `${process.env.HOME}/.claude`;
const TEAM_FILE = `${PAI_DIR}/config/team.yaml`;

const DEFAULT_CONFIG: ThinkTankConfig = {
  timeout: 30000,
  parallel: true,
  preferredProviders: ['claude', 'gemini', 'codex'],
  claudeFallback: true,
};

// -----------------------------------------------------------------------------
// MultiLLMBridge Class
// -----------------------------------------------------------------------------

export class MultiLLMBridge {
  private config: ThinkTankConfig;
  private status: MultiLLMStatus;

  constructor(config: Partial<ThinkTankConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.status = this.detectMultiLLM();
  }

  // ---------------------------------------------------------------------------
  // Detection
  // ---------------------------------------------------------------------------

  /**
   * Detect if MultiLLM pack is installed and configured
   */
  private detectMultiLLM(): MultiLLMStatus {
    // Check if team.yaml exists
    if (!existsSync(TEAM_FILE)) {
      return {
        available: false,
        providers: [],
        error: 'team.yaml not found - MultiLLM pack not configured',
      };
    }

    try {
      const content = readFileSync(TEAM_FILE, 'utf-8');
      // Simple YAML parsing for provider names
      const providerMatches = content.match(/name:\s*(\w+)/g) || [];
      const providers = providerMatches.map(m => m.replace('name:', '').trim());
      const availableProviders = this.filterAvailableProviders(content, providers);

      return {
        available: availableProviders.length > 0,
        teamFile: TEAM_FILE,
        providers: availableProviders,
      };
    } catch (error) {
      return {
        available: false,
        providers: [],
        error: `Failed to read team.yaml: ${error}`,
      };
    }
  }

  /**
   * Filter to only available providers
   */
  private filterAvailableProviders(content: string, providers: string[]): string[] {
    // Parse available: true/false for each provider
    const available: string[] = [];
    for (const provider of providers) {
      // Simple regex to find provider block and check available status
      const providerBlock = new RegExp(
        `name:\\s*${provider}[\\s\\S]*?available:\\s*(true|false)`,
        'i'
      );
      const match = content.match(providerBlock);
      if (match && match[1].toLowerCase() === 'true') {
        available.push(provider);
      }
    }
    return available;
  }

  /**
   * Get current MultiLLM status
   */
  getStatus(): MultiLLMStatus {
    return this.status;
  }

  /**
   * Check if MultiLLM is available
   */
  isAvailable(): boolean {
    return this.status.available;
  }

  /**
   * Get list of available providers
   */
  getProviders(): string[] {
    return this.status.providers;
  }

  // ---------------------------------------------------------------------------
  // Core Query Methods (TEXT-ONLY)
  // ---------------------------------------------------------------------------

  /**
   * Query a single provider (TEXT-ONLY, NO TOOLS)
   *
   * CRITICAL: This uses stdin/stdout only. No --tools, no MCPs, no permissions.
   */
  private async queryProvider(
    provider: string,
    prompt: string
  ): Promise<ProviderPerspective> {
    const startTime = Date.now();

    try {
      // Build TEXT-ONLY command - NO TOOLS, NO MCPs
      const result = await this.executeTextOnlyQuery(provider, prompt);
      const duration = Date.now() - startTime;

      return {
        provider,
        response: result,
        durationMs: duration,
        success: true,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        provider,
        response: '',
        durationMs: duration,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute TEXT-ONLY query to a provider
   *
   * CRITICAL CONSTRAINT: No tools, no MCPs, stdin -> stdout only
   */
  private async executeTextOnlyQuery(
    provider: string,
    prompt: string
  ): Promise<string> {
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // Provider-specific TEXT-ONLY commands
    // These commands are intentionally simple - just text in, text out
    const commands: Record<string, string> = {
      claude: `claude -p '${escapedPrompt}' --output-format text`,
      gemini: `gemini -p '${escapedPrompt}'`,
      codex: `codex -p '${escapedPrompt}'`,
      ollama: `ollama run llama3 '${escapedPrompt}'`,
      opencode: `opencode chat '${escapedPrompt}'`,
    };

    const cmd = commands[provider.toLowerCase()];
    if (!cmd) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Execute with timeout
    const timeoutMs = this.config.timeout;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await $`sh -c ${cmd}`.quiet();
      clearTimeout(timeout);
      return result.stdout.toString().trim();
    } catch (error: unknown) {
      clearTimeout(timeout);
      // Check if it's an AbortError
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Provider ${provider} timed out after ${timeoutMs}ms`);
      }
      // Return stdout if available even on error (some CLIs exit non-zero but have output)
      if (error && typeof error === 'object' && 'stdout' in error) {
        const stdout = (error as { stdout: Buffer }).stdout.toString().trim();
        if (stdout) return stdout;
      }
      throw error;
    }
  }

  /**
   * Query Claude directly (fallback when MultiLLM unavailable)
   */
  private async queryClaudeFallback(prompt: string): Promise<ProviderPerspective> {
    return this.queryProvider('claude', prompt);
  }

  // ---------------------------------------------------------------------------
  // Think Tank Methods
  // ---------------------------------------------------------------------------

  /**
   * Think - Query multiple providers for diverse perspectives
   *
   * Used by DIRECTOR for strategic decisions before assigning to DOERs.
   *
   * @param question - The strategic question to consider
   * @param providers - Optional list of providers (defaults to all available)
   * @returns ThinkResult with perspectives from multiple providers
   */
  async think(
    question: string,
    providers?: string[]
  ): Promise<ThinkResult> {
    const startTime = Date.now();

    // Determine which providers to query
    const targetProviders = this.selectProviders(providers);

    if (targetProviders.length === 0) {
      // Fallback to Claude-only
      if (this.config.claudeFallback) {
        const perspective = await this.queryClaudeFallback(question);
        return {
          question,
          perspectives: [perspective],
          totalDurationMs: Date.now() - startTime,
          providersQueried: 1,
          providersResponded: perspective.success ? 1 : 0,
        };
      }
      throw new Error('No providers available and Claude fallback disabled');
    }

    // Query providers
    const perspectives = this.config.parallel
      ? await Promise.all(targetProviders.map(p => this.queryProvider(p, question)))
      : await this.querySequentially(targetProviders, question);

    const result: ThinkResult = {
      question,
      perspectives,
      totalDurationMs: Date.now() - startTime,
      providersQueried: targetProviders.length,
      providersResponded: perspectives.filter(p => p.success).length,
    };

    // Generate synthesis if multiple perspectives
    if (result.providersResponded > 1) {
      result.synthesis = this.synthesizePerspectives(perspectives);
    }

    return result;
  }

  /**
   * Debate - Multi-round discussion for complex decisions
   *
   * Providers respond to each other's perspectives across multiple rounds.
   *
   * @param topic - The topic to debate
   * @param rounds - Number of debate rounds (default: 2)
   * @param providers - Optional list of providers
   * @returns DebateResult with full debate transcript and conclusion
   */
  async debate(
    topic: string,
    rounds: number = 2,
    providers?: string[]
  ): Promise<DebateResult> {
    const startTime = Date.now();
    const targetProviders = this.selectProviders(providers);
    const debateRounds: DebateResult['rounds'] = [];

    // Minimum 2 providers for a debate
    if (targetProviders.length < 2) {
      // Single-provider fallback - just do a think
      const thinkResult = await this.think(topic, targetProviders);
      return {
        topic,
        rounds: [{
          round: 1,
          perspectives: thinkResult.perspectives,
        }],
        synthesis: thinkResult.synthesis || thinkResult.perspectives[0]?.response || '',
        conclusion: thinkResult.perspectives[0]?.response || 'No conclusion available',
        totalDurationMs: Date.now() - startTime,
      };
    }

    let previousResponses: string[] = [];

    for (let round = 1; round <= rounds; round++) {
      const roundPrompt = round === 1
        ? this.buildInitialDebatePrompt(topic)
        : this.buildFollowUpDebatePrompt(topic, previousResponses, round);

      const perspectives = this.config.parallel
        ? await Promise.all(targetProviders.map(p => this.queryProvider(p, roundPrompt)))
        : await this.querySequentially(targetProviders, roundPrompt);

      debateRounds.push({ round, perspectives });
      previousResponses = perspectives
        .filter(p => p.success)
        .map(p => `[${p.provider}]: ${p.response}`);
    }

    // Final synthesis
    const allPerspectives = debateRounds.flatMap(r => r.perspectives);
    const synthesis = this.synthesizePerspectives(allPerspectives);
    const conclusion = this.generateConclusion(topic, debateRounds);

    return {
      topic,
      rounds: debateRounds,
      synthesis,
      conclusion,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /**
   * Select providers to query based on availability and preferences
   */
  private selectProviders(requested?: string[]): string[] {
    const available = this.status.providers;

    if (!this.status.available || available.length === 0) {
      // If MultiLLM unavailable but Claude fallback enabled, return claude
      if (this.config.claudeFallback) {
        return ['claude'];
      }
      return [];
    }

    if (requested && requested.length > 0) {
      // Filter requested to only available
      return requested.filter(p =>
        available.map(a => a.toLowerCase()).includes(p.toLowerCase())
      );
    }

    // Use preferred providers if available, otherwise all
    const preferred = this.config.preferredProviders.filter(p =>
      available.map(a => a.toLowerCase()).includes(p.toLowerCase())
    );

    return preferred.length > 0 ? preferred : available;
  }

  /**
   * Query providers sequentially
   */
  private async querySequentially(
    providers: string[],
    prompt: string
  ): Promise<ProviderPerspective[]> {
    const results: ProviderPerspective[] = [];
    for (const provider of providers) {
      results.push(await this.queryProvider(provider, prompt));
    }
    return results;
  }

  /**
   * Build initial debate prompt
   */
  private buildInitialDebatePrompt(topic: string): string {
    return `You are participating in a multi-perspective analysis.

TOPIC: ${topic}

Provide your perspective on this topic. Be specific and actionable.
Consider trade-offs, risks, and alternatives.
Keep your response focused and under 300 words.`;
  }

  /**
   * Build follow-up debate prompt with previous responses
   */
  private buildFollowUpDebatePrompt(
    topic: string,
    previousResponses: string[],
    round: number
  ): string {
    return `You are participating in a multi-perspective analysis (Round ${round}).

TOPIC: ${topic}

PREVIOUS PERSPECTIVES:
${previousResponses.join('\n\n')}

Now respond to the other perspectives. Do you agree? Disagree?
What did they miss? What would you add or modify?
Keep your response focused and under 200 words.`;
  }

  /**
   * Synthesize multiple perspectives into a summary
   */
  private synthesizePerspectives(perspectives: ProviderPerspective[]): string {
    const successful = perspectives.filter(p => p.success);
    if (successful.length === 0) return 'No successful responses to synthesize.';
    if (successful.length === 1) return successful[0].response;

    // Build synthesis summary
    const points = successful.map(p => `- [${p.provider}]: ${this.extractKeyPoints(p.response)}`);

    return `## Think Tank Synthesis

### Perspectives
${points.join('\n')}

### Key Themes
${this.identifyCommonThemes(successful)}`;
  }

  /**
   * Extract key points from a response (first 100 chars)
   */
  private extractKeyPoints(response: string): string {
    const firstSentence = response.split(/[.!?]/)[0];
    return firstSentence.slice(0, 150) + (firstSentence.length > 150 ? '...' : '');
  }

  /**
   * Identify common themes across perspectives
   */
  private identifyCommonThemes(perspectives: ProviderPerspective[]): string {
    // Simple keyword analysis
    const keywords = new Map<string, number>();
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'any', 'some', 'no', 'none', 'such', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'it', 'its', 'if', 'your', 'you', 'i', 'we', 'they', 'them', 'their', 'our', 'my', 'me', 'he', 'she', 'him', 'her', 'his']);

    for (const p of perspectives) {
      const words = p.response.toLowerCase().match(/\b\w{4,}\b/g) || [];
      for (const word of words) {
        if (!stopWords.has(word)) {
          keywords.set(word, (keywords.get(word) || 0) + 1);
        }
      }
    }

    // Get top themes
    const sorted = Array.from(keywords.entries())
      .filter(([_, count]) => count >= perspectives.length)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    return sorted.length > 0
      ? `Common themes: ${sorted.join(', ')}`
      : 'Perspectives offer diverse, non-overlapping viewpoints.';
  }

  /**
   * Generate final conclusion from debate
   */
  private generateConclusion(topic: string, rounds: DebateResult['rounds']): string {
    const lastRound = rounds[rounds.length - 1];
    if (!lastRound) return 'No conclusion available.';

    const successfulResponses = lastRound.perspectives.filter(p => p.success);
    if (successfulResponses.length === 0) return 'No successful final responses.';

    // Take the most comprehensive final response
    const longest = successfulResponses.reduce((a, b) =>
      a.response.length > b.response.length ? a : b
    );

    return `Based on ${rounds.length} rounds of analysis on "${topic}", the think tank concludes:

${longest.response}

[Primary perspective from: ${longest.provider}]`;
  }
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

/**
 * Create a MultiLLMBridge instance with optional config
 */
export function createThinkTank(config?: Partial<ThinkTankConfig>): MultiLLMBridge {
  return new MultiLLMBridge(config);
}

/**
 * Quick check if MultiLLM is available
 */
export function detectMultiLLM(): MultiLLMStatus {
  const bridge = new MultiLLMBridge();
  return bridge.getStatus();
}
