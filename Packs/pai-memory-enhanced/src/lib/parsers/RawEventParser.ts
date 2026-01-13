/**
 * Raw Event Parser
 *
 * Parses raw-outputs JSONL files and groups events by session_id.
 * Handles the granular hook events captured by PAI's event system.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getMemoryDir } from '../../config/defaults';

export interface RawEvent {
  source_app: string;
  session_id: string;
  hook_event_type: string;
  timestamp: string;
  cwd?: string;
  tool_name?: string;
  [key: string]: unknown;
}

export interface SessionGroup {
  sessionId: string;
  sourceApp: string;
  startTime: string;
  endTime: string;
  events: RawEvent[];
  workingDirs: Set<string>;
  toolsUsed: Map<string, number>;
}

/**
 * Parse a single JSONL file into raw events
 */
export function parseRawEventsFile(filePath: string): RawEvent[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const events: RawEvent[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && obj.session_id) {
        events.push(obj as RawEvent);
      }
    } catch {
      // Skip invalid lines
    }
  }

  return events;
}

/**
 * Get raw events file path for a specific date
 */
export function getRawEventsPath(date: Date = new Date()): string {
  const memoryDir = getMemoryDir();
  const month = date.toISOString().slice(0, 7); // YYYY-MM
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return join(memoryDir, 'raw-outputs', month, `${dateStr}_all-events.jsonl`);
}

/**
 * List all available raw event files
 */
export function listRawEventFiles(): string[] {
  const memoryDir = getMemoryDir();
  const rawOutputsDir = join(memoryDir, 'raw-outputs');

  if (!existsSync(rawOutputsDir)) return [];

  const files: string[] = [];

  // Scan month directories
  for (const monthDir of readdirSync(rawOutputsDir)) {
    const monthPath = join(rawOutputsDir, monthDir);
    try {
      const monthFiles = readdirSync(monthPath);
      for (const file of monthFiles) {
        if (file.endsWith('.jsonl')) {
          files.push(join(monthPath, file));
        }
      }
    } catch {
      // Skip non-directories
    }
  }

  return files.sort();
}

/**
 * Group raw events by session_id
 */
export function groupEventsBySession(events: RawEvent[]): Map<string, SessionGroup> {
  const sessions = new Map<string, SessionGroup>();

  for (const event of events) {
    const { session_id, source_app, timestamp, cwd, tool_name } = event;

    if (!sessions.has(session_id)) {
      sessions.set(session_id, {
        sessionId: session_id,
        sourceApp: source_app || 'unknown',
        startTime: timestamp,
        endTime: timestamp,
        events: [],
        workingDirs: new Set(),
        toolsUsed: new Map(),
      });
    }

    const session = sessions.get(session_id)!;
    session.events.push(event);

    // Update time bounds
    if (timestamp < session.startTime) session.startTime = timestamp;
    if (timestamp > session.endTime) session.endTime = timestamp;

    // Track working directories
    if (cwd) session.workingDirs.add(cwd);

    // Track tool usage
    if (tool_name) {
      session.toolsUsed.set(tool_name, (session.toolsUsed.get(tool_name) || 0) + 1);
    }
  }

  return sessions;
}

/**
 * Parse raw events for a specific date and group by session
 */
export function parseSessionsForDate(date: Date = new Date()): SessionGroup[] {
  const events = parseRawEventsFile(getRawEventsPath(date));
  const sessionMap = groupEventsBySession(events);
  return Array.from(sessionMap.values()).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

/**
 * Get session duration in minutes
 */
export function getSessionDuration(session: SessionGroup): number {
  const start = new Date(session.startTime).getTime();
  const end = new Date(session.endTime).getTime();
  return Math.round((end - start) / 60000);
}
