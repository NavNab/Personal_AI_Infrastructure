/**
 * Session Start Hook - load bootstrap slice
 *
 * Runs at the beginning of each PAI session to load minimal context
 * including identity, preferences, active project, and latest handoff.
 */

import { join } from 'path';
import { getMemoryDir, CONFIG } from '../config/defaults';
import { readJson, ensureDir } from '../storage/JsonlStore';
import { FactStore } from '../storage/FactStore';
import { HypothesisStore } from '../storage/HypothesisStore';
import { HandoffStore } from '../storage/HandoffStore';
import { ProjectStore } from '../storage/ProjectStore';
import { EpisodeStore } from '../storage/EpisodeStore';
import { getRelevantContext, formatContextForInjection } from '../lib/extractors/ContextInjector';
import type { BootstrapSlice, Identity, Preferences } from '../schema/BootstrapSlice';

export interface SessionStartResult {
  bootstrapSlice: BootstrapSlice;
  factCount: number;
  openHypotheses: number;
  hasHandoff: boolean;
  memoryContext: string; // Injected memory context
}

export async function sessionStartHook(): Promise<SessionStartResult> {
  const memoryDir = getMemoryDir();

  // Ensure directory structure exists
  ensureDir(join(memoryDir, 'projects', '.keep'));
  ensureDir(join(memoryDir, 'episodes', '.keep'));
  ensureDir(join(memoryDir, 'handoffs', '.keep'));

  // Load identity and preferences
  const identity = readJson<Identity | null>(join(memoryDir, 'self', 'identity.json'), null);

  const preferences = readJson<Preferences | null>(join(memoryDir, 'self', 'preferences.json'), null);

  // Load stores
  const factStore = new FactStore();
  const hypothesisStore = new HypothesisStore();
  const handoffStore = new HandoffStore();
  const projectStore = new ProjectStore();
  const episodeStore = new EpisodeStore();

  // Get active project and handoff
  const activeProject = projectStore.getActive();
  const latestHandoff = handoffStore.load();

  // Create bootstrap slice with essential context
  const bootstrapSlice: BootstrapSlice = {
    identity,
    preferences,
    activeProject,
    latestHandoff,
  };

  // Get memory context for injection
  const workingDir = process.cwd();
  const relevantContext = getRelevantContext(workingDir, {
    hypothesisThreshold: 3, // Only high-confidence hypotheses
    includeAllFacts: true, // Always show all facts
  });
  const memoryContext = formatContextForInjection(relevantContext);

  // Log session start event
  episodeStore.log('session_start', {
    bootstrap: {
      hasIdentity: !!identity,
      hasPreferences: !!preferences,
      hasActiveProject: !!activeProject,
      hasHandoff: !!latestHandoff,
    },
    env: {
      modelId: process.env[CONFIG.envVars.modelId] || 'unknown',
      provider: process.env[CONFIG.envVars.llmProvider] || 'unknown',
    },
    memoryInjection: {
      factsInjected: relevantContext.facts.length,
      hypothesesInjected: relevantContext.hypotheses.length,
    },
  });

  return {
    bootstrapSlice,
    factCount: factStore.count(),
    openHypotheses: hypothesisStore.list('open').length,
    hasHandoff: !!latestHandoff,
    memoryContext,
  };
}

export function formatBootstrapSummary(result: SessionStartResult): string {
  const lines: string[] = [
    '=== PAI Memory Session Start ===',
    `Facts: ${result.factCount}`,
    `Open hypotheses: ${result.openHypotheses}`,
  ];

  if (result.hasHandoff && result.bootstrapSlice.latestHandoff) {
    const h = result.bootstrapSlice.latestHandoff;
    lines.push(`Previous state: ${h.projectState}`);
    lines.push(`Continue with: ${h.nextAction}`);
  }

  if (result.bootstrapSlice.activeProject) {
    const p = result.bootstrapSlice.activeProject;
    lines.push(`Active project: ${p.slug} (${p.state})`);
  }

  // Include memory context if available
  if (result.memoryContext && result.memoryContext.trim()) {
    lines.push('');
    lines.push(result.memoryContext);
  }

  return lines.join('\n');
}
