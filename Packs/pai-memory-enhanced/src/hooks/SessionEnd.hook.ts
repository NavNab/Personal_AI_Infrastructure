/**
 * Session End Hook - create handoff for next instance
 *
 * Creates a handoff document to maintain context continuity
 * between AI sessions.
 */

import { HandoffStore } from '../storage/HandoffStore';
import { ProjectStore } from '../storage/ProjectStore';
import { FactStore } from '../storage/FactStore';
import { EpisodeStore } from '../storage/EpisodeStore';
import type { Handoff } from '../schema/Handoff';

export interface SessionEndOptions {
  summary?: string;
  projectState?: string;
  nextAction?: string;
}

export interface SessionEndResult {
  handoff: Handoff | null;
  summary: string;
}

export async function sessionEndHook(
  options: SessionEndOptions = {}
): Promise<SessionEndResult> {
  const handoffStore = new HandoffStore();
  const projectStore = new ProjectStore();
  const factStore = new FactStore();
  const episodeStore = new EpisodeStore();

  let handoff: Handoff | null = null;

  // Get active project for handoff context
  const activeProject = projectStore.getActive();

  if (activeProject || options.projectState) {
    // Create handoff from project or options
    const projectState = options.projectState || activeProject?.state || 'unknown';
    const nextAction = options.nextAction || activeProject?.nextAction || 'resume';

    handoff = handoffStore.create(projectState, nextAction, { project: activeProject?.slug, summary: options.summary }, factStore.count());
  }

  // Log session end
  const summary = options.summary || 'Session ended';
  episodeStore.log('session_end', {
    summary,
    hadHandoff: !!handoff,
  });

  return { handoff, summary };
}
