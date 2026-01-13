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

export interface SessionEndResult {
  handoff: Handoff | null;
  summary: string;
  learningsProcessed: ProcessedLearning[];
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

  // Process learnings into hypotheses
  if (options.learnings && options.learnings.length > 0) {
    const existingOpen = hypothesisStore.list('open');

    for (const learning of options.learnings) {
      const existing = existingOpen.find(
        (h) => h.statement.toLowerCase() === learning.statement.toLowerCase()
      );

      let isNew: boolean;
      let observationCount: number;

      if (existing) {
        // Reinforce existing hypothesis
        existing.observationCount += 1;
        observationCount = existing.observationCount;
        isNew = false;
      } else {
        // Create new hypothesis with category tag
        const hypothesis = hypothesisStore.add(
          learning.statement,
          CONFIG.defaultExpiryDays,
          [], // No cues for session-end learnings
          [learning.category, 'session-learning']
        );
        observationCount = hypothesis.observationCount;
        isNew = true;
      }

      learningsProcessed.push({
        statement: learning.statement,
        category: learning.category,
        isNew,
        observationCount,
      });
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

  return { handoff, summary, learningsProcessed };
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

  if (result.handoff) {
    lines.push(`\nHandoff created for next session`);
  }

  return lines.join('\n');
}
