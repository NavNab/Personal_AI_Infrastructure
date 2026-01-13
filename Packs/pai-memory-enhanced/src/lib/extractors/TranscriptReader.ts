/**
 * Transcript Reader
 *
 * Reads Claude Code conversation transcripts from JSONL files and extracts
 * meaningful conversation content for learning extraction.
 *
 * The transcript files are located at:
 *   ~/.claude/projects/{project-hash}/{session-id}.jsonl
 *
 * Each line contains complete message content:
 * - User messages with full text
 * - Assistant responses with thinking, text, and tool blocks
 * - Tool calls with inputs/outputs
 *
 * This reader filters to only user-facing content:
 * - User text messages (not tool results)
 * - Assistant text blocks (not thinking or tool_use)
 */

import { readFileSync, existsSync } from 'fs';

/**
 * Content block types in transcript entries
 */
interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  content?: string;
  tool_use_id?: string;
}

/**
 * Transcript entry structure (one line in JSONL)
 */
interface TranscriptEntry {
  type: 'user' | 'assistant' | 'file-history-snapshot';
  parentUuid?: string;
  sessionId?: string;
  timestamp?: string;
  message?: {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
  };
}

/**
 * Extracted conversation message
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** Estimated token count for this message */
  tokens: number;
}

/**
 * Result of reading a transcript
 */
export interface TranscriptReaderResult {
  /** Extracted messages (user + assistant text only) */
  messages: ConversationMessage[];
  /** Total estimated tokens in extracted content */
  totalTokens: number;
  /** Session ID from transcript */
  sessionId: string;
  /** Raw file size in bytes */
  rawSize: number;
  /** Number of lines in raw file */
  rawLines: number;
  /** Reduction percentage achieved */
  reductionPercent: number;
}

/**
 * Extract text content from message content field
 *
 * Filters out:
 * - tool_result blocks (tool outputs)
 * - thinking blocks (internal reasoning)
 * - tool_use blocks (tool invocations)
 *
 * Keeps:
 * - text blocks (user-facing content)
 * - string content (direct text)
 */
export function extractTextFromContent(content: string | ContentBlock[]): string {
  // Direct string content
  if (typeof content === 'string') {
    return content;
  }

  // Array of content blocks
  if (!Array.isArray(content)) {
    return '';
  }

  const texts: string[] = [];
  for (const block of content) {
    // Skip non-user-facing content
    if (block.type === 'tool_result') continue;
    if (block.type === 'thinking') continue;
    if (block.type === 'tool_use') continue;

    // Extract text blocks
    if (block.type === 'text' && block.text) {
      texts.push(block.text);
    }
  }

  return texts.join('\n').trim();
}

/**
 * Estimate token count from text
 * Rough estimate: 1 token ≈ 4 characters
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Read and parse a transcript JSONL file
 *
 * @param transcriptPath - Full path to the transcript JSONL file
 * @returns Parsed transcript with extracted messages and metadata
 */
export function readTranscript(transcriptPath: string): TranscriptReaderResult {
  if (!existsSync(transcriptPath)) {
    throw new Error(`Transcript file not found: ${transcriptPath}`);
  }

  const rawContent = readFileSync(transcriptPath, 'utf-8');
  const rawSize = Buffer.byteLength(rawContent, 'utf-8');
  const lines = rawContent.trim().split('\n');
  const rawLines = lines.length;
  const rawTokens = estimateTokens(rawContent);

  const messages: ConversationMessage[] = [];
  let sessionId = '';

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const entry: TranscriptEntry = JSON.parse(line);

      // Skip non-conversation entries
      if (entry.type === 'file-history-snapshot') continue;
      if (!entry.message) continue;

      // Extract session ID from first entry
      if (!sessionId && entry.sessionId) {
        sessionId = entry.sessionId;
      }

      const role = entry.type as 'user' | 'assistant';
      const content = extractTextFromContent(entry.message.content);
      const timestamp = entry.timestamp || new Date().toISOString();

      // Skip empty or trivially short messages
      if (!content || content.length < 10) continue;

      const tokens = estimateTokens(content);

      messages.push({
        role,
        content,
        timestamp,
        tokens,
      });
    } catch {
      // Skip invalid JSON lines
    }
  }

  // Calculate totals
  const totalTokens = messages.reduce((sum, m) => sum + m.tokens, 0);
  const reductionPercent = rawTokens > 0
    ? Math.round(((rawTokens - totalTokens) / rawTokens) * 1000) / 10
    : 0;

  return {
    messages,
    totalTokens,
    sessionId,
    rawSize,
    rawLines,
    reductionPercent,
  };
}

/**
 * Format messages as conversation text for LLM input
 *
 * @param messages - Extracted conversation messages
 * @param options - Formatting options
 * @returns Formatted conversation string
 */
export function formatConversation(
  messages: ConversationMessage[],
  options: {
    /** Maximum characters per message (truncate if exceeded) */
    maxMessageLength?: number;
    /** Include timestamps in output */
    includeTimestamps?: boolean;
  } = {}
): string {
  const { maxMessageLength = 1000, includeTimestamps = false } = options;

  return messages
    .map((m) => {
      const role = m.role.toUpperCase();
      let content = m.content;

      // Truncate long messages
      if (content.length > maxMessageLength) {
        content = content.slice(0, maxMessageLength) + '...';
      }

      if (includeTimestamps) {
        const time = new Date(m.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
        return `[${time}] ${role}: ${content}`;
      }

      return `${role}: ${content}`;
    })
    .join('\n\n');
}

/**
 * Get user messages only (for learning extraction)
 */
export function getUserMessages(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.filter((m) => m.role === 'user');
}

/**
 * Get assistant messages only
 */
export function getAssistantMessages(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.filter((m) => m.role === 'assistant');
}
