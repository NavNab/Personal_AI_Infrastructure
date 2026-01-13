/**
 * Post Context Capture Hook - auto-create hypotheses
 *
 * Intercepts context captures and creates hypotheses automatically,
 * incrementing observation counts for repeated patterns.
 */

import { CONFIG } from '../config/defaults';
import { HypothesisStore } from '../storage/HypothesisStore';
import { EpisodeStore } from '../storage/EpisodeStore';
import type { Cue } from '../schema/Cue';
import type { Hypothesis } from '../schema/Hypothesis';

export interface CaptureContext {
  content: string;
  source: string;
  cwd?: string;
  tags?: string[];
}

export interface CaptureResult {
  hypothesis: Hypothesis;
  isNew: boolean;
  observationCount: number;
}

export async function postContextCaptureHook(
  context: CaptureContext
): Promise<CaptureResult> {
  const hypothesisStore = new HypothesisStore();
  const episodeStore = new EpisodeStore();

  // Build cues from context
  const cues: Cue[] = [];
  if (context.cwd) {
    cues.push({
      triggers: { pathContains: context.cwd },
      action: { type: 'surface' },
    });
  }

  // Create or reinforce hypothesis
  const existingOpen = hypothesisStore.list('open');
  const existing = existingOpen.find(
    (h) => h.statement.toLowerCase() === context.content.toLowerCase()
  );

  let hypothesis: Hypothesis;
  let isNew: boolean;

  if (existing) {
    // Reinforce existing hypothesis
    existing.observationCount += 1;
    hypothesis = existing;
    isNew = false;
  } else {
    // Create new hypothesis
    hypothesis = hypothesisStore.add(context.content, CONFIG.defaultExpiryDays, cues, context.tags || []);
    isNew = true;
  }

  // Log the capture
  episodeStore.log('context_capture', {
    statement: context.content,
    source: context.source,
    isNew,
    observationCount: hypothesis.observationCount,
  });

  return {
    hypothesis,
    isNew,
    observationCount: hypothesis.observationCount,
  };
}
