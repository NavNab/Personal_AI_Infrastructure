/**
 * Audit Logger - track all memory state changes
 *
 * Provides append-only JSONL logging for all memory operations
 * with rich query capabilities and action filtering.
 */

import * as fs from 'fs';
import { join } from 'path';
import { getMemoryDir, CONFIG } from '../config/defaults';

export interface FrequencyAuditEntry {
  timestamp: string;
  action: string;
  details: Record<string, unknown>;
  sessionId?: string;
}

export type FrequencyAuditAction =
  | 'hypothesis_created'
  | 'hypothesis_expired'
  | 'hypothesis_auto_promoted'
  | 'hypothesis_promoted'
  | 'hypotheses_expired'
  | 'hypotheses_promoted'
  | 'manual_promotion'
  | 'auto_promotion'
  | 'batch_promotion'
  | 'fact_created'
  | 'fact_demoted'
  | 'evidence_added'
  | 'cue_matched'
  | 'sweep_completed';

export class FrequencyAuditLogger {
  private filePath: string;
  private sessionId: string;

  constructor() {
    const memoryDir = getMemoryDir();
    this.filePath = join(memoryDir, 'audit.jsonl');
    this.sessionId = process.env[CONFIG.envVars.sessionId] || crypto.randomUUID();
    this.ensureFile();
  }

  private ensureFile(): void {
    const dir = join(this.filePath, '..');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '');
    }
  }

  /**
   * Log an action with details
   */
  log(action: FrequencyAuditAction | string, details: Record<string, unknown> = {}): FrequencyAuditEntry {
    const entry: FrequencyAuditEntry = {
      timestamp: new Date().toISOString(),
      action,
      details,
      sessionId: this.sessionId,
    };

    this.appendEntry(entry);
    return entry;
  }

  /**
   * Append entry to JSONL file
   */
  private appendEntry(entry: FrequencyAuditEntry): void {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.filePath, line);
  }

  /**
   * Read all entries from file
   */
  private readEntries(): FrequencyAuditEntry[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const content = fs.readFileSync(this.filePath, 'utf-8');
    const entries: FrequencyAuditEntry[] = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as FrequencyAuditEntry);
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  }

  /**
   * List recent entries (newest first)
   */
  list(limit: number = 100): FrequencyAuditEntry[] {
    const entries = this.readEntries();
    entries.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return entries.slice(0, limit);
  }

  /**
   * List entries by action type
   */
  listByAction(action: FrequencyAuditAction | string, limit: number = 50): FrequencyAuditEntry[] {
    return this.list(1000)
      .filter(e => e.action === action)
      .slice(0, limit);
  }

  /**
   * List entries for current session
   */
  listCurrentSession(limit: number = 100): FrequencyAuditEntry[] {
    return this.list(1000)
      .filter(e => e.sessionId === this.sessionId)
      .slice(0, limit);
  }

  /**
   * List entries within a time range
   */
  listByTimeRange(start: Date, end: Date, limit: number = 100): FrequencyAuditEntry[] {
    const startTime = start.getTime();
    const endTime = end.getTime();

    return this.list(10000)
      .filter(e => {
        const entryTime = new Date(e.timestamp).getTime();
        return entryTime >= startTime && entryTime <= endTime;
      })
      .slice(0, limit);
  }

  /**
   * Get action counts for analytics
   */
  getActionCounts(): Record<string, number> {
    const entries = this.readEntries();
    const counts: Record<string, number> = {};

    for (const entry of entries) {
      counts[entry.action] = (counts[entry.action] || 0) + 1;
    }

    return counts;
  }

  /**
   * Get entries for a specific hypothesis/fact by ID
   */
  getEntriesForItem(itemId: string): FrequencyAuditEntry[] {
    return this.readEntries()
      .filter(e => {
        const details = e.details;
        return details.id === itemId ||
               details.hypothesisId === itemId ||
               details.factId === itemId;
      })
      .sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
  }

  /**
   * Search entries by content in details
   */
  search(query: string, limit: number = 50): FrequencyAuditEntry[] {
    const q = query.toLowerCase();
    return this.readEntries()
      .filter(e => JSON.stringify(e.details).toLowerCase().includes(q))
      .sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, limit);
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Clear all audit entries (use with caution)
   */
  clear(): void {
    fs.writeFileSync(this.filePath, '');
  }

  /**
   * Get file path (for debugging)
   */
  getFilePath(): string {
    return this.filePath;
  }
}
