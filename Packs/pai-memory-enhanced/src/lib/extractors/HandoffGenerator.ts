/**
 * Handoff Generator
 *
 * Creates session handoff documents from extracted learnings.
 * Uses template-based approach for instant, reliable generation.
 *
 * Output is written to:
 * - MEMORY/handoffs/latest.md (always overwritten)
 * - MEMORY/handoffs/YYYY-MM-DD_{sessionId}.md (archived)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ExtractedLearning } from './LearningExtractor';
import type { LearningCategory } from '../../hooks/SessionEnd.hook';

/**
 * Input for handoff generation
 */
export interface HandoffInput {
  /** Session ID from transcript */
  sessionId: string;
  /** Extracted learnings from the session */
  learnings: ExtractedLearning[];
  /** Brief summary of the session (from LLM or inferred) */
  sessionSummary: string;
  /** Working directory for the session */
  workingDir: string;
  /** Files that were accessed during the session */
  filesAccessed?: string[];
  /** Tools used and their counts */
  toolsUsed?: { tool: string; count: number }[];
}

/**
 * Result of handoff generation
 */
export interface HandoffResult {
  /** Generated markdown content */
  content: string;
  /** Path to latest.md */
  latestPath: string;
  /** Path to archived copy */
  archivePath: string;
  /** Whether writing succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Group learnings by category
 */
function groupByCategory(learnings: ExtractedLearning[]): Map<LearningCategory, ExtractedLearning[]> {
  const groups = new Map<LearningCategory, ExtractedLearning[]>();

  for (const learning of learnings) {
    const existing = groups.get(learning.category) || [];
    existing.push(learning);
    groups.set(learning.category, existing);
  }

  return groups;
}

/**
 * Infer topic from learnings
 */
function inferTopic(learnings: ExtractedLearning[], workingDir: string): string {
  if (learnings.length === 0) {
    return 'General Session';
  }

  // Try to find common themes in statements
  const statements = learnings.map(l => l.statement.toLowerCase());

  // Check for common keywords
  const topicKeywords: Record<string, string> = {
    test: 'Testing',
    bug: 'Bug Fixing',
    feature: 'Feature Development',
    refactor: 'Refactoring',
    config: 'Configuration',
    setup: 'Setup',
    install: 'Installation',
    api: 'API Development',
    database: 'Database Work',
    ui: 'UI Development',
    deploy: 'Deployment',
    memory: 'Memory System',
    hook: 'Hook Development',
    skill: 'Skill Development',
  };

  for (const [keyword, topic] of Object.entries(topicKeywords)) {
    if (statements.some(s => s.includes(keyword))) {
      return topic;
    }
  }

  // Fall back to directory name
  const dirName = path.basename(workingDir);
  if (dirName && dirName !== '.') {
    return `Work in ${dirName}`;
  }

  return 'General Session';
}

/**
 * Format a single learning as a bullet point
 */
function formatLearning(learning: ExtractedLearning): string {
  const confidence = learning.confidence >= 0.9 ? '🔵' : learning.confidence >= 0.7 ? '🟢' : '🟡';
  const evidence = learning.evidence ? ` *(evidence: "${learning.evidence}")*` : '';
  return `- ${confidence} ${learning.statement}${evidence}`;
}

/**
 * Format a category section
 */
function formatCategorySection(category: LearningCategory, learnings: ExtractedLearning[]): string {
  if (learnings.length === 0) return '';

  const titles: Record<LearningCategory, string> = {
    preference: '### Preferences',
    decision: '### Decisions',
    correction: '### Corrections',
    pattern: '### Patterns',
    context: '### Context',
    domain: '### Domain Knowledge',
  };

  const title = titles[category] || `### ${category}`;
  const items = learnings.map(formatLearning).join('\n');

  return `${title}\n\n${items}`;
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate handoff markdown content
 */
export function generateHandoff(input: HandoffInput): string {
  const {
    sessionId,
    learnings,
    sessionSummary,
    workingDir,
    filesAccessed = [],
    toolsUsed = [],
  } = input;

  const date = getDateString();
  const topic = inferTopic(learnings, workingDir);
  const grouped = groupByCategory(learnings);

  // Build summary
  const summary = sessionSummary || (learnings.length > 0
    ? `Session completed with ${learnings.length} learning${learnings.length === 1 ? '' : 's'} extracted.`
    : 'Session completed with no significant learnings detected.');

  // Build learnings sections
  const categorySections: string[] = [];
  const categoryOrder: LearningCategory[] = ['preference', 'decision', 'correction', 'pattern', 'context', 'domain'];

  for (const category of categoryOrder) {
    const section = formatCategorySection(category, grouped.get(category) || []);
    if (section) {
      categorySections.push(section);
    }
  }

  // Build files section
  const filesSection = filesAccessed.length > 0
    ? filesAccessed.map(f => `- \`${f}\``).join('\n')
    : `- \`${workingDir}\``;

  // Build tools section (if any)
  const toolsSection = toolsUsed.length > 0
    ? '\n## Tools Used\n\n' + toolsUsed
        .sort((a, b) => b.count - a.count)
        .map(t => `- **${t.tool}**: ${t.count} calls`)
        .join('\n')
    : '';

  // Build the full document
  const learningsSectionContent = categorySections.length > 0
    ? categorySections.join('\n\n')
    : '*No significant learnings detected in this session.*';

  const markdown = `# Session Handoff

**Created:** ${date}
**Session:** ${sessionId.slice(0, 8)}...
**Topic:** ${topic}

---

## Summary

${summary}

## Learnings Captured

${learningsSectionContent}
${toolsSection}

## Files Referenced

${filesSection}

---

*Resume with: "continue from ${workingDir}"*
`;

  return markdown;
}

/**
 * Get the MEMORY directory path
 */
function getMemoryDir(): string {
  // Try standard locations
  const candidates = [
    process.env.PAI_DIR ? path.join(process.env.PAI_DIR, 'MEMORY') : null,
    path.join(process.env.HOME || '', '.claude', 'MEMORY'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Default fallback
  return path.join(process.env.HOME || '', '.claude', 'MEMORY');
}

/**
 * Write handoff to disk
 *
 * Writes to:
 * - MEMORY/handoffs/latest.md (always)
 * - MEMORY/handoffs/YYYY-MM-DD_{sessionId}.md (archive)
 */
export function writeHandoff(content: string, sessionId: string): HandoffResult {
  const memoryDir = getMemoryDir();
  const handoffsDir = path.join(memoryDir, 'handoffs');
  const date = getDateString();

  // Ensure directory exists
  try {
    if (!fs.existsSync(handoffsDir)) {
      fs.mkdirSync(handoffsDir, { recursive: true });
    }
  } catch (err) {
    return {
      content,
      latestPath: '',
      archivePath: '',
      success: false,
      error: `Failed to create handoffs directory: ${err}`,
    };
  }

  const latestPath = path.join(handoffsDir, 'latest.md');
  const archivePath = path.join(handoffsDir, `${date}_${sessionId.slice(0, 8)}.md`);

  try {
    // Write latest
    fs.writeFileSync(latestPath, content, 'utf-8');

    // Write archive
    fs.writeFileSync(archivePath, content, 'utf-8');

    return {
      content,
      latestPath,
      archivePath,
      success: true,
    };
  } catch (err) {
    return {
      content,
      latestPath,
      archivePath,
      success: false,
      error: `Failed to write handoff: ${err}`,
    };
  }
}

/**
 * Full pipeline: generate and write handoff
 */
export function createHandoff(input: HandoffInput): HandoffResult {
  const content = generateHandoff(input);
  return writeHandoff(content, input.sessionId);
}
