/**
 * Session End Hook - create handoff and extract learnings
 *
 * Creates a handoff document to maintain context continuity
 * between AI sessions. Also processes any learnings captured
 * during the conversation into hypotheses.
 */

import { HandoffStore } from '../storage/HandoffStore';
import { ProjectStore } from '../storage/ProjectStore';
import { FactStore } from '../storage/FactStore';
import { EpisodeStore } from '../storage/EpisodeStore';
import { HypothesisStore } from '../storage/HypothesisStore';
import { CONFIG } from '../config/defaults';
import { buildIndex } from '../lib/extractors/SemanticSearch';
import type { Handoff } from '../schema/Handoff';
import type { Hypothesis } from '../schema/Hypothesis';

/**
 * Learning categories that define "worth keeping"
 */
export type LearningCategory =
  | 'preference' // User preferences
  | 'correction' // User corrected an assumption
  | 'decision' // Project/technical decision made
  | 'pattern' // Observed behavioral pattern
  | 'domain' // Domain-specific knowledge
  | 'context'; // Personal/environmental context

export interface Learning {
  statement: string;
  category: LearningCategory;
  confidence?: number; // Optional: if Claude is very confident, can start higher
}

export interface SessionEndOptions {
  summary?: string;
  projectState?: string;
  nextAction?: string;
  learnings?: Learning[]; // Observations to record as hypotheses
}

export interface ProcessedLearning {
  statement: string;
  category: LearningCategory;
  isNew: boolean;
  observationCount: number;
}

export interface SemanticIndexResult {
  indexed: number;
  skipped: number;
  errors: number;
}

export interface SessionEndResult {
  handoff: Handoff | null;
  summary: string;
  learningsProcessed: ProcessedLearning[];
  semanticIndex?: SemanticIndexResult;
}

export async function sessionEndHook(
  options: SessionEndOptions = {}
): Promise<SessionEndResult> {
  const handoffStore = new HandoffStore();
  const projectStore = new ProjectStore();
  const factStore = new FactStore();
  const episodeStore = new EpisodeStore();
  const hypothesisStore = new HypothesisStore();

  let handoff: Handoff | null = null;
  const learningsProcessed: ProcessedLearning[] = [];
  let semanticIndex: SemanticIndexResult | undefined;

  // Process learnings into hypotheses
  // Let HypothesisStore.add() handle deduplication and persistence (DRY principle)
  if (options.learnings && options.learnings.length > 0) {
    for (const learning of options.learnings) {
      // HypothesisStore.add() handles:
      // 1. Finding similar existing hypotheses (exact + fuzzy match)
      // 2. Incrementing observationCount if exists
      // 3. Persisting changes to disk
      // 4. Creating new hypothesis if no match
      const hypothesis = hypothesisStore.add(
        learning.statement,
        CONFIG.defaultExpiryDays,
        [], // No cues for session-end learnings
        [learning.category, 'session-learning']
      );

      // observationCount === 1 means this is a new hypothesis
      const isNew = hypothesis.observationCount === 1;

      learningsProcessed.push({
        statement: learning.statement,
        category: learning.category,
        isNew,
        observationCount: hypothesis.observationCount,
      });
    }

    // Update semantic index incrementally after learnings are stored
    // This ensures new learnings are immediately searchable
    try {
      semanticIndex = await buildIndex({ force: false, verbose: false });
    } catch (err) {
      // Silently fail - Ollama might not be running
      // Index can be rebuilt later with: pai-memory semantic --build
    }
  }

  // Get active project for handoff context
  const activeProject = projectStore.getActive();

  if (activeProject || options.projectState) {
    // Create handoff from project or options
    const projectState = options.projectState || activeProject?.state || 'unknown';
    const nextAction = options.nextAction || activeProject?.nextAction || 'resume';

    handoff = handoffStore.create(
      projectState,
      nextAction,
      {
        project: activeProject?.slug,
        summary: options.summary,
        learningsCount: learningsProcessed.length,
      },
      factStore.count()
    );
  }

  // Log session end
  const summary = options.summary || 'Session ended';
  episodeStore.log('session_end', {
    summary,
    hadHandoff: !!handoff,
    learningsProcessed: learningsProcessed.length,
  });

  return { handoff, summary, learningsProcessed, semanticIndex };
}

/**
 * Format session end summary for output
 */
export function formatSessionEndSummary(result: SessionEndResult): string {
  const lines: string[] = [];

  lines.push('=== Session End ===');

  if (result.learningsProcessed.length > 0) {
    lines.push(`\nLearnings recorded: ${result.learningsProcessed.length}`);
    for (const l of result.learningsProcessed) {
      const status = l.isNew ? 'NEW' : `+1 (${l.observationCount} total)`;
      lines.push(`  [${l.category}] ${l.statement} - ${status}`);
    }
  }

  if (result.semanticIndex) {
    lines.push(`\nSemantic index: ${result.semanticIndex.indexed} indexed, ${result.semanticIndex.skipped} skipped`);
  }

  if (result.handoff) {
    lines.push(`\nHandoff created for next session`);
  }

  return lines.join('\n');
}
