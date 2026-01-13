/**
 * Handoff interface - session continuity
 *
 * Preserves context between AI sessions.
 */

export interface Handoff {
  created: string; // ISO 8601
  createdBy: string; // Instance identifier
  projectState: string; // Current state
  nextAction: string; // Recommended next step
  context: Record<string, unknown>; // Additional context
  memoryCount: number; // Number of memories at handoff time
}

/**
 * Create a handoff for the next instance
 */
export function createHandoff(
  projectState: string,
  nextAction: string,
  context: Record<string, unknown> = {},
  memoryCount: number = 0
): Handoff {
  return {
    created: new Date().toISOString(),
    createdBy: `pai-${process.pid}`,
    projectState,
    nextAction,
    context,
    memoryCount,
  };
}

/**
 * Create handoff from active project state
 */
export function createHandoffFromProject(
  project: { slug?: string; state?: string; nextAction?: string },
  memoryCount: number = 0
): Handoff {
  return createHandoff(
    project.state ?? '',
    project.nextAction ?? '',
    { project: project.slug ?? 'default' },
    memoryCount
  );
}

/**
 * Check if a handoff is recent (within N hours)
 */
export function isRecentHandoff(handoff: Handoff, maxAgeHours: number = 24): boolean {
  const createdAt = new Date(handoff.created).getTime();
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  return now - createdAt < maxAgeMs;
}
