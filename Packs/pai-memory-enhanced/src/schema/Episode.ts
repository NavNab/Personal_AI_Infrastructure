/**
 * Episode interface - daily session events
 *
 * Tracks events within daily episodes for context.
 */

export interface EpisodeEvent {
  timestamp: string; // ISO 8601
  type: string; // Event type identifier
  [key: string]: unknown; // Additional payload fields
}

/**
 * Create a new episode event with timestamp
 */
export function createEpisodeEvent(
  type: string,
  payload: Record<string, unknown> = {}
): EpisodeEvent {
  return {
    timestamp: new Date().toISOString(),
    type,
    ...payload,
  };
}

/**
 * Create a session start event
 */
export function createSessionStartEvent(
  bootstrap: Record<string, boolean>,
  context: Record<string, unknown> = {}
): EpisodeEvent {
  return createEpisodeEvent('session_start', { bootstrap, context });
}

/**
 * Create a session end event
 */
export function createSessionEndEvent(summary: string = ''): EpisodeEvent {
  return createEpisodeEvent('session_end', { summary });
}

/**
 * Get episode file path for a specific date
 * Returns ISO date string (YYYY-MM-DD) format
 */
export function getEpisodeDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
