/**
 * Learning Extractor
 *
 * Extracts learnings from conversation content using a local LLM (qwen3:4b via Ollama).
 * Produces structured Learning objects ready for the hypothesis system.
 *
 * Pipeline:
 * 1. Take sampled conversation content
 * 2. Build extraction prompt
 * 3. Call Ollama with qwen3:4b
 * 4. Parse JSON response
 * 5. Validate and return learnings
 */

import type { LearningCategory } from '../../hooks/SessionEnd.hook';

/**
 * Raw learning from LLM extraction
 */
export interface ExtractedLearning {
  statement: string;
  category: LearningCategory;
  confidence: number;
  evidence: string;
}

/**
 * Extraction result from LLM
 */
export interface ExtractionResult {
  learnings: ExtractedLearning[];
  sessionSummary: string;
  /** Whether extraction succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Raw LLM output for debugging */
  rawOutput?: string;
  /** Extraction duration in ms */
  durationMs: number;
}

/**
 * Valid learning categories
 */
const VALID_CATEGORIES: LearningCategory[] = [
  'preference',
  'decision',
  'correction',
  'pattern',
  'domain',
  'context',
];

/**
 * Extraction prompt template v1.3
 *
 * Ultra-simple format for qwen3:4b compliance.
 * One-shot example + minimal instructions.
 */
const EXTRACTION_PROMPT = `Extract user preferences from this conversation.

EXAMPLE OUTPUT:
{"learnings":[{"s":"User prefers simple solutions over complex ones","c":"preference","e":"keep it simple"}],"sum":"User worked on X"}

RULES:
- s = statement about USER (start with "User prefers/wants/needs")
- c = category (preference/decision/correction/context)
- e = direct quote from USER as evidence
- Only include what USER said, not assistant actions
- Return empty array if no user preferences found

CONVERSATION:
{CONVERSATION}

OUTPUT JSON:`;

/**
 * Build the full extraction prompt with conversation content
 *
 * @param conversation - Formatted conversation string
 * @returns Full prompt for LLM
 */
export function buildExtractionPrompt(conversation: string): string {
  return EXTRACTION_PROMPT.replace('{CONVERSATION}', conversation);
}

/**
 * Filter conversation to only include USER messages
 * This reduces confusion from technical assistant content
 */
function filterUserMessages(conversation: string): string {
  const lines = conversation.split('\n');
  const userLines: string[] = [];
  let inUserBlock = false;

  for (const line of lines) {
    if (line.startsWith('USER:')) {
      inUserBlock = true;
      userLines.push(line);
    } else if (line.startsWith('A:') || line.startsWith('ASSISTANT:')) {
      inUserBlock = false;
    } else if (inUserBlock && line.trim()) {
      userLines.push(line);
    }
  }

  return userLines.join('\n').slice(0, 8000); // Limit to ~2K tokens
}

/**
 * System message for extraction
 */
const SYSTEM_MESSAGE = `You are a JSON extraction bot. Output ONLY valid JSON, nothing else.
Task: Extract USER PREFERENCES from conversation logs.
Format: {"learnings":[{"s":"User prefers X","c":"preference","e":"exact user quote"}]}
Categories: preference, decision, correction, context

IMPORTANT:
- Extract what the USER said about their preferences, NOT what was done
- Each "s" must start with "User prefers/wants/needs"
- Each "e" must be a direct quote from the user
- Ignore technical implementation details
- If no clear user preferences, output: {"learnings":[]}`;

/**
 * Available models for extraction in order of preference
 */
const EXTRACTION_MODELS = ['qwen3:4b', 'deepseek-r1:8b'];

/**
 * Call Ollama with specified model using the chat API
 *
 * Uses chat API with system message for better format compliance.
 *
 * @param conversation - Conversation content to analyze
 * @param model - Model to use for extraction
 * @param timeoutMs - Timeout in milliseconds (default: 60000)
 * @returns Raw LLM output
 */
async function callOllamaWithModel(
  conversation: string,
  model: string,
  timeoutMs = 60000
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_MESSAGE },
          { role: 'user', content: `Here are USER messages from a conversation. Extract their preferences:\n\n${filterUserMessages(conversation)}\n\nJSON:` },
        ],
        stream: false,
        options: {
          num_predict: 2048,
          temperature: 0.1, // Very low temperature for format compliance
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { message?: { content: string } };
    return data.message?.content || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Call Ollama with fallback to alternative models
 *
 * Tries primary model first, then falls back to alternatives on failure.
 */
async function callOllama(conversation: string, timeoutMs = 60000): Promise<string> {
  let lastError: Error | null = null;

  for (const model of EXTRACTION_MODELS) {
    try {
      const result = await callOllamaWithModel(conversation, model, timeoutMs);
      if (result && result.length > 10) {
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Continue to next model
    }
  }

  throw lastError || new Error('All models failed');
}

/**
 * Parse JSON from LLM output
 *
 * Handles common LLM output issues:
 * - Extra text before/after JSON
 * - Markdown code blocks
 * - Thinking output before JSON (qwen3/deepseek thinking mode)
 * - <think>...</think> tags (deepseek-r1)
 * - Multiple JSON objects (take the one with "learnings" key)
 * - Direct array output (no wrapping object)
 * - Object with arbitrary keys (convert to array)
 */
function parseJsonFromOutput(output: string): { learnings: unknown[]; session_summary: string } | null {
  // Pre-process: Strip thinking tags and prefix
  let cleanOutput = output;

  // Remove <think>...</think> blocks (deepseek-r1)
  cleanOutput = cleanOutput.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // Remove "Thinking..." prefix
  cleanOutput = cleanOutput.replace(/^Thinking\.{3,}[\s\S]*?(?=\{|\[)/i, '');

  // Strategy 0: Check for direct array output (some models return just the array)
  const arrayMatch = cleanOutput.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          learnings: parsed,
          session_summary: '',
        };
      }
    } catch {
      // Continue to other strategies
    }
  }

  // Strategy 1: Look for JSON in markdown code blocks first
  const codeBlockMatch = cleanOutput.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (Array.isArray(parsed.learnings)) {
        return {
          learnings: parsed.learnings,
          session_summary: parsed.session_summary || parsed.sessionSummary || '',
        };
      }
    } catch {
      // Continue to other strategies
    }
  }

  // Strategy 2: Find balanced JSON objects and try each one
  // This handles cases where there's thinking output with braces
  const jsonCandidates = findBalancedJsonObjects(cleanOutput);

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate);
      // Check for "learnings" array first
      if (Array.isArray(parsed.learnings)) {
        return {
          learnings: parsed.learnings,
          session_summary: parsed.session_summary || parsed.sessionSummary || '',
        };
      }
      // Convert object with string values to array of learnings
      // e.g., { "key1": "learning text", "key2": "learning text" }
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        const values = Object.entries(parsed).filter(
          ([, v]) => typeof v === 'string' && (v as string).length > 20
        );
        if (values.length > 0) {
          const learnings = values.map(([key, value]) => ({
            statement: value as string,
            topic: key.replace(/_/g, ' '),
          }));
          return {
            learnings,
            session_summary: '',
          };
        }
      }
    } catch {
      // Try next candidate
    }
  }

  // Strategy 3: Last resort - greedy match (original approach)
  const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.learnings)) {
        return {
          learnings: parsed.learnings,
          session_summary: parsed.session_summary || parsed.sessionSummary || '',
        };
      }
    } catch {
      // Failed to parse
    }
  }

  return null;
}

/**
 * Find all balanced JSON objects in a string
 * Returns them in order of size (largest first, as that's likely the full response)
 */
function findBalancedJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === '{') {
      // Found start of potential JSON object
      let depth = 1;
      let j = i + 1;
      let inString = false;
      let escapeNext = false;

      while (j < text.length && depth > 0) {
        const char = text[j];

        if (escapeNext) {
          escapeNext = false;
        } else if (char === '\\' && inString) {
          escapeNext = true;
        } else if (char === '"') {
          inString = !inString;
        } else if (!inString) {
          if (char === '{') depth++;
          else if (char === '}') depth--;
        }
        j++;
      }

      if (depth === 0) {
        objects.push(text.slice(i, j));
        i = j;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  // Sort by length descending (larger objects first)
  return objects.sort((a, b) => b.length - a.length);
}

/**
 * Validate and normalize a learning object
 *
 * Handles multiple formats from different LLMs:
 * - Standard: { statement, category, confidence, evidence }
 * - Alternative: { topic, description/details }
 *
 * @param raw - Raw learning from LLM
 * @returns Validated learning or null if invalid
 */
function validateLearning(raw: unknown): ExtractedLearning | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Extract statement - support multiple field names (including short forms)
  let statement = '';
  if (typeof obj.statement === 'string') {
    statement = obj.statement;
  } else if (typeof obj.s === 'string') {
    // Short form: s = statement
    statement = obj.s;
  } else if (typeof obj.learning === 'string') {
    // Alternative format: single "learning" field
    statement = obj.learning;
  } else if (typeof obj.topic === 'string') {
    // Alternative format: use topic + details as statement
    const details = obj.details || obj.description || '';
    statement = typeof details === 'string' && details.length > 0
      ? `${obj.topic}: ${details}`
      : obj.topic;
  } else if (typeof obj.description === 'string') {
    statement = obj.description;
  }

  // Must have a meaningful statement
  if (statement.length < 10) {
    return null;
  }

  // Prepend "User" if not already present and convert to third person
  if (!statement.toLowerCase().startsWith('user ')) {
    statement = `User ${statement.charAt(0).toLowerCase()}${statement.slice(1)}`;
  }

  // Extract category - with fallback inference (support short form 'c')
  let category: LearningCategory = 'context';
  const rawCategory = obj.category || obj.c;
  if (typeof rawCategory === 'string' && VALID_CATEGORIES.includes(rawCategory as LearningCategory)) {
    category = rawCategory as LearningCategory;
  } else {
    // Infer category from content
    const lowerStatement = statement.toLowerCase();
    if (lowerStatement.includes('prefer') || lowerStatement.includes('like') || lowerStatement.includes('want')) {
      category = 'preference';
    } else if (lowerStatement.includes('decided') || lowerStatement.includes('chose') || lowerStatement.includes('will')) {
      category = 'decision';
    } else if (lowerStatement.includes('not') || lowerStatement.includes('wrong') || lowerStatement.includes('correct')) {
      category = 'correction';
    } else if (lowerStatement.includes('always') || lowerStatement.includes('usually') || lowerStatement.includes('tend')) {
      category = 'pattern';
    } else if (lowerStatement.includes('domain') || lowerStatement.includes('technical')) {
      category = 'domain';
    }
  }

  // Optional fields with defaults
  const confidence = typeof obj.confidence === 'number'
    ? Math.min(1, Math.max(0, obj.confidence))
    : 0.7;

  // Support short form 'e' for evidence
  const rawEvidence = obj.evidence || obj.e || obj.source_quote || '';
  const evidence = typeof rawEvidence === 'string' ? rawEvidence : '';

  // Skip low-confidence learnings
  if (confidence < 0.5) {
    return null;
  }

  return {
    statement,
    category,
    confidence,
    evidence,
  };
}

/**
 * Extract learnings from conversation content
 *
 * @param conversation - Formatted conversation string
 * @param options - Extraction options
 * @returns Extraction result with learnings
 */
export async function extractLearnings(
  conversation: string,
  options: {
    /** Timeout in ms (default: 60000) */
    timeout?: number;
    /** Model to use (default: qwen3:4b) */
    model?: string;
  } = {}
): Promise<ExtractionResult> {
  const { timeout = 60000 } = options;
  const startTime = Date.now();

  // Handle empty conversation
  if (!conversation || conversation.trim().length < 50) {
    return {
      learnings: [],
      sessionSummary: 'Conversation too short for learning extraction.',
      success: true,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Call LLM with conversation (system message handles the prompt)
    const rawOutput = await callOllama(conversation, timeout);

    // Parse JSON from output
    const parsed = parseJsonFromOutput(rawOutput);
    if (!parsed) {
      return {
        learnings: [],
        sessionSummary: '',
        success: false,
        error: 'Failed to parse JSON from LLM output',
        rawOutput,
        durationMs: Date.now() - startTime,
      };
    }

    // Validate each learning
    const learnings: ExtractedLearning[] = [];
    for (const raw of parsed.learnings) {
      const validated = validateLearning(raw);
      if (validated) {
        learnings.push(validated);
      }
    }

    return {
      learnings,
      sessionSummary: parsed.session_summary,
      success: true,
      rawOutput,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      learnings: [],
      sessionSummary: '',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Check if Ollama is available via HTTP API
 */
export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if any of the extraction models is installed
 */
export async function checkModelAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;

    const data = await response.json() as { models?: Array<{ name: string }> };
    const modelNames = data.models?.map(m => m.name) || [];

    // Check if any extraction model is available
    return EXTRACTION_MODELS.some(model =>
      modelNames.some(name => name.includes(model.split(':')[0]))
    );
  } catch {
    return false;
  }
}
