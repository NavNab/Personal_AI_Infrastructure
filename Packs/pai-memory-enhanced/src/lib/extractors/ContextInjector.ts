/**
 * Context Injector
 *
 * Surfaces relevant facts and hypotheses at session start to close
 * the memory loop. Without this, the system collects but doesn't inject.
 *
 * Features:
 * 1. Load all validated facts
 * 2. Load high-confidence hypotheses (observationCount >= threshold)
 * 3. Filter by relevance to working directory (cue-based)
 * 4. Format for injection into Claude's context
 */

import { FactStore } from '../../storage/FactStore';
import { HypothesisStore } from '../../storage/HypothesisStore';
import { ProjectStore } from '../../storage/ProjectStore';
import type { Fact } from '../../schema/Fact';
import type { Hypothesis, HypothesisPriority } from '../../schema/Hypothesis';
import { isHighPriority, detectPriority } from '../../schema/Hypothesis';

/**
 * Context ready for injection into session
 */
export interface InjectedContext {
  facts: Array<{
    key: string;
    value: string;
    importance: string;
    tags: string[];
  }>;
  hypotheses: Array<{
    statement: string;
    observationCount: number;
    tags: string[];
  }>;
  actionItems: Array<{
    statement: string;
    priority: HypothesisPriority;
    observationCount: number;
  }>;
  projectContext?: {
    name: string;
    state: string;
    nextAction?: string;
  };
  workingDir: string;
  relevanceFilter?: string;
}

/**
 * Options for context retrieval
 */
export interface ContextOptions {
  hypothesisThreshold?: number; // Min observation count (default: 3)
  maxFacts?: number; // Max facts to return (default: 20)
  maxHypotheses?: number; // Max hypotheses to return (default: 10)
  includeAllFacts?: boolean; // Include all facts regardless of relevance
  projectFilter?: string; // Explicit project to filter for
}

/**
 * Memory scope classification
 */
export type MemoryScope = 'global' | 'project';

/**
 * Detected project info
 */
export interface DetectedProject {
  name: string;
  path: string;
  keywords: string[];
}

/**
 * Known project mappings - maps directory patterns to project names
 */
const PROJECT_MAPPINGS: Array<{
  pattern: RegExp;
  name: string;
  keywords: string[];
  isGlobal?: boolean;
}> = [
  {
    pattern: /\/\.claude\/skills\/MemoryEnhanced/i,
    name: 'PAI-Memory',
    keywords: ['memory', 'pai', 'hypothesis', 'fact', 'learning'],
  },
  {
    pattern: /\/\.claude\/skills/i,
    name: 'PAI-Skills',
    keywords: ['skill', 'pai', 'claude'],
  },
  {
    pattern: /\/\.claude/i,
    name: 'PAI',
    keywords: ['pai', 'claude', 'ai'],
  },
  {
    pattern: /\/webflow/i,
    name: 'Webflow',
    keywords: ['webflow', 'cms', 'website'],
  },
  {
    pattern: /\/dotfiles/i,
    name: 'Dotfiles',
    keywords: ['dotfiles', 'config', 'setup'],
  },
];

/**
 * Global fact indicators - facts with these patterns are always shown
 */
const GLOBAL_INDICATORS = [
  /clean\s*(architecture|code)/i,
  /kiss/i,
  /solid/i,
  /dry/i,
  /prefer.*simple/i,
  /coding.*philosophy/i,
  /typescript/i,
  /javascript/i,
];

/**
 * Detect project from working directory
 */
export function detectProject(workingDir: string): DetectedProject | null {
  for (const mapping of PROJECT_MAPPINGS) {
    if (mapping.pattern.test(workingDir)) {
      return {
        name: mapping.name,
        path: workingDir,
        keywords: mapping.keywords,
      };
    }
  }

  // Fallback: extract from path segments
  const segments = workingDir.split('/').filter((s) => s.length > 2);
  const lastMeaningful = segments.filter(
    (s) => !['Users', 'home', 'src', 'lib', 'app'].includes(s)
  );

  if (lastMeaningful.length > 0) {
    const name = lastMeaningful[lastMeaningful.length - 1];
    return {
      name,
      path: workingDir,
      keywords: [name.toLowerCase()],
    };
  }

  return null;
}

/**
 * Check if a fact/hypothesis is global (always relevant)
 */
function isGlobalMemory(item: { value?: string; statement?: string; tags?: string[] }): boolean {
  const content = (item.value || item.statement || '').toLowerCase();
  const tags = (item.tags || []).map((t) => t.toLowerCase());

  // Check if it matches global indicators
  for (const indicator of GLOBAL_INDICATORS) {
    if (indicator.test(content)) return true;
  }

  // Check for global tags
  if (tags.includes('global') || tags.includes('universal')) return true;

  return false;
}

/**
 * Extract project keywords from working directory (legacy, kept for compatibility)
 */
function extractProjectKeywords(workingDir: string): string[] {
  const project = detectProject(workingDir);
  return project?.keywords || [];
}

/**
 * Check if a fact/hypothesis is relevant to the working context
 */
function isRelevantToContext(
  item: { tags: string[]; value?: string; statement?: string },
  keywords: string[]
): boolean {
  if (keywords.length === 0) return true;

  const content = (item.value || item.statement || '').toLowerCase();
  const tags = item.tags.map((t) => t.toLowerCase());

  return keywords.some(
    (kw) => content.includes(kw) || tags.some((t) => t.includes(kw))
  );
}

/**
 * Get relevant context for the current session
 *
 * Filtering logic:
 * 1. Global facts (KISS, SOLID, etc.) are ALWAYS included
 * 2. Project-specific facts are included if they match current project
 * 3. High-confidence hypotheses follow the same rules
 */
export function getRelevantContext(
  workingDir: string,
  options: ContextOptions = {}
): InjectedContext {
  const {
    hypothesisThreshold = 3,
    maxFacts = 20,
    maxHypotheses = 10,
    includeAllFacts = true,
    projectFilter,
  } = options;

  const factStore = new FactStore();
  const hypothesisStore = new HypothesisStore();
  const projectStore = new ProjectStore();

  // Detect current project
  const detectedProject = detectProject(workingDir);
  const keywords = projectFilter
    ? [projectFilter.toLowerCase()]
    : detectedProject?.keywords || [];

  // Load all facts
  const allFacts = factStore.list(undefined, 100);

  // Filter facts: include global facts + project-relevant facts
  const relevantFacts = allFacts.filter((f) => {
    // Always include global facts
    if (isGlobalMemory(f)) return true;
    // Include all if option set
    if (includeAllFacts) return true;
    // Include if relevant to current project
    return isRelevantToContext(f, keywords);
  });

  // Sort by importance (high > medium > low), then global first
  const importanceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  relevantFacts.sort((a, b) => {
    // Global facts come first
    const aGlobal = isGlobalMemory(a) ? 0 : 1;
    const bGlobal = isGlobalMemory(b) ? 0 : 1;
    if (aGlobal !== bGlobal) return aGlobal - bGlobal;
    // Then by importance
    return importanceOrder[a.importance] - importanceOrder[b.importance];
  });

  // Load high-confidence hypotheses
  const openHypotheses = hypothesisStore.list('open');
  const highConfidence = openHypotheses
    .filter((h) => {
      if (h.observationCount < hypothesisThreshold) return false;
      // Include global hypotheses
      if (isGlobalMemory(h)) return true;
      // Include all if option set
      if (includeAllFacts) return true;
      // Include if relevant to current project
      return isRelevantToContext(h, keywords);
    })
    .sort((a, b) => b.observationCount - a.observationCount);

  // Extract action items (resume/pending/urgent) regardless of confidence
  // These are surfaced even if they only have 1 observation
  const actionItems = openHypotheses
    .filter((h) => {
      const priority = h.priority || detectPriority(h.statement);
      return priority !== 'normal';
    })
    .map((h) => ({
      statement: h.statement,
      priority: (h.priority || detectPriority(h.statement)) as HypothesisPriority,
      observationCount: h.observationCount,
    }))
    .sort((a, b) => {
      // Sort by priority: urgent > action-needed > resume
      const priorityOrder: Record<HypothesisPriority, number> = {
        urgent: 0,
        'action-needed': 1,
        resume: 2,
        normal: 3,
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  // Get active project (from store or detected)
  const activeProject = projectStore.getActive();
  const projectContext = activeProject
    ? {
        name: activeProject.slug,
        state: activeProject.state,
        nextAction: activeProject.nextAction,
      }
    : detectedProject
      ? {
          name: detectedProject.name,
          state: 'detected',
          nextAction: undefined,
        }
      : undefined;

  return {
    facts: relevantFacts.slice(0, maxFacts).map((f) => ({
      key: f.key,
      value: f.value,
      importance: f.importance,
      tags: f.tags,
    })),
    hypotheses: highConfidence.slice(0, maxHypotheses).map((h) => ({
      statement: h.statement,
      observationCount: h.observationCount,
      tags: h.tags,
    })),
    actionItems,
    projectContext,
    workingDir,
    relevanceFilter: detectedProject?.name || (keywords.length > 0 ? keywords.join(', ') : undefined),
  };
}

/**
 * Format context for injection into Claude's system prompt
 */
export function formatContextForInjection(context: InjectedContext): string {
  const lines: string[] = [];

  // Header
  lines.push('=== Memory Context ===');
  lines.push('');

  // Action Items / Pending Work - ALWAYS show first (most important)
  if (context.actionItems.length > 0) {
    lines.push('**⚡ Pending Work:**');
    for (const item of context.actionItems) {
      const priorityIcon = item.priority === 'urgent' ? '🔴' :
                          item.priority === 'action-needed' ? '🟠' : '🔵';
      lines.push(`- ${priorityIcon} ${item.statement}`);
    }
    lines.push('');
  }

  // Validated Facts
  if (context.facts.length > 0) {
    lines.push('**Validated Facts:**');
    for (const fact of context.facts) {
      const importance =
        fact.importance === 'high' ? ' ⭐' : fact.importance === 'low' ? '' : '';
      lines.push(`- ${fact.value}${importance}`);
    }
    lines.push('');
  }

  // High-Confidence Hypotheses
  if (context.hypotheses.length > 0) {
    lines.push('**High-Confidence Observations:**');
    for (const h of context.hypotheses) {
      lines.push(`- ${h.statement} (${h.observationCount} sessions)`);
    }
    lines.push('');
  }

  // Project Context
  if (context.projectContext) {
    const status = context.projectContext.state === 'detected' ? '(auto-detected)' : `(${context.projectContext.state})`;
    lines.push(`**Project:** ${context.projectContext.name} ${status}`);
    if (context.projectContext.nextAction) {
      lines.push(`  Next: ${context.projectContext.nextAction}`);
    }
    lines.push('');
  }

  // If no context available
  if (context.facts.length === 0 && context.hypotheses.length === 0) {
    lines.push('*No validated memories yet. Learning in progress...*');
    lines.push('');
  }

  // Relevance filter info (debug)
  if (context.relevanceFilter) {
    lines.push(`_Context filtered for: ${context.relevanceFilter}_`);
  }

  return lines.join('\n');
}

/**
 * Get injection-ready context as a single string
 * Convenience function for SessionStart hook
 */
export function getInjectionContext(
  workingDir: string = process.cwd(),
  options: ContextOptions = {}
): string {
  const context = getRelevantContext(workingDir, options);
  return formatContextForInjection(context);
}

/**
 * Get context statistics for debugging
 */
export function getContextStats(): {
  totalFacts: number;
  totalHypotheses: number;
  highConfidenceHypotheses: number;
  hypothesisDistribution: Record<number, number>;
} {
  const factStore = new FactStore();
  const hypothesisStore = new HypothesisStore();

  const facts = factStore.list(undefined, 1000);
  const hypotheses = hypothesisStore.list('open');

  // Count hypotheses by observation count
  const distribution: Record<number, number> = {};
  for (const h of hypotheses) {
    distribution[h.observationCount] = (distribution[h.observationCount] || 0) + 1;
  }

  return {
    totalFacts: facts.length,
    totalHypotheses: hypotheses.length,
    highConfidenceHypotheses: hypotheses.filter((h) => h.observationCount >= 3)
      .length,
    hypothesisDistribution: distribution,
  };
}

/**
 * Run context injector and output to stdout
 * Can be called directly as a CLI tool
 */
export function runContextInjector(options: ContextOptions = {}): void {
  const workingDir = process.cwd();
  const context = getRelevantContext(workingDir, options);
  const formatted = formatContextForInjection(context);

  console.log(formatted);
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const threshold = args.includes('--threshold')
    ? parseInt(args[args.indexOf('--threshold') + 1], 10)
    : 3;

  const options: ContextOptions = {
    hypothesisThreshold: threshold,
  };

  if (args.includes('--stats')) {
    const stats = getContextStats();
    console.log('=== Context Statistics ===');
    console.log(`Total facts: ${stats.totalFacts}`);
    console.log(`Total hypotheses: ${stats.totalHypotheses}`);
    console.log(`High-confidence (3+): ${stats.highConfidenceHypotheses}`);
    console.log('\nObservation distribution:');
    for (const [count, num] of Object.entries(stats.hypothesisDistribution)) {
      console.log(`  ${count} observation(s): ${num} hypotheses`);
    }
  } else {
    runContextInjector(options);
  }
}
