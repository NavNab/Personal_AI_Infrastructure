/**
 * Bootstrap Slice - minimal context at session start
 *
 * Provides essential context for new AI sessions.
 */

import type { Handoff } from './Handoff';

export type AssertivenesLevel = 'silent' | 'subtle' | 'direct';

export interface Identity {
  version: number;
  user: Record<string, unknown>;
  assistant: Record<string, unknown>;
  created: string; // ISO 8601
}

export interface Preferences {
  version: number;
  assertiveness: AssertivenesLevel;
  preferences: Record<string, unknown>;
}

export interface Project {
  slug: string;
  goal: string;
  state: string;
  nextAction: string;
  blockers: string[];
  active: boolean;
  updated: string; // ISO 8601
}

export interface BootstrapSlice {
  identity: Identity | null;
  preferences: Preferences | null;
  activeProject: Project | null;
  latestHandoff: Handoff | null;
}

/**
 * Create a default identity
 */
export function createDefaultIdentity(): Identity {
  return {
    version: 1,
    user: {},
    assistant: {},
    created: new Date().toISOString(),
  };
}

/**
 * Create default preferences
 */
export function createDefaultPreferences(): Preferences {
  return {
    version: 1,
    assertiveness: 'silent',
    preferences: {},
  };
}

/**
 * Create a new project
 */
export function createProject(
  slug: string,
  goal: string = '',
  active: boolean = true
): Project {
  return {
    slug,
    goal,
    state: '',
    nextAction: '',
    blockers: [],
    active,
    updated: new Date().toISOString(),
  };
}

/**
 * Create empty bootstrap slice
 */
export function createEmptyBootstrapSlice(): BootstrapSlice {
  return {
    identity: null,
    preferences: null,
    activeProject: null,
    latestHandoff: null,
  };
}

/**
 * Check if bootstrap slice has essential data
 */
export function hasEssentialData(slice: BootstrapSlice): boolean {
  return slice.identity !== null || slice.activeProject !== null;
}

/**
 * Summarize bootstrap slice for logging
 */
export function summarizeBootstrap(slice: BootstrapSlice): Record<string, boolean> {
  return {
    identity: slice.identity !== null,
    preferences: slice.preferences !== null,
    activeProject: slice.activeProject !== null,
    latestHandoff: slice.latestHandoff !== null,
  };
}
