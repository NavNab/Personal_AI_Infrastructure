/**
 * ArenaStore - Persistent storage for arena sessions
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';

export interface ArenaSession {
  id: string;
  mission: string;
  doers: string[];
  budget: number;
  turnsUsed: number;
  status: 'running' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface ArenaMessage {
  timestamp: string;
  from: string;
  to: string;
  type: 'task' | 'response' | 'question' | 'decision' | 'collaboration';
  content: string;
}

export interface ArenaBudgetEntry {
  agentId: string;
  turnsUsed: number;
  turnsAllocated: number;
}

export class ArenaStore {
  private baseDir: string;

  constructor() {
    const paiDir = process.env.PAI_DIR || join(homedir(), '.claude');
    this.baseDir = join(paiDir, 'MEMORY', 'arena', 'sessions');
    this.ensureDir(this.baseDir);
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private sessionDir(sessionId: string): string {
    const dir = join(this.baseDir, sessionId);
    this.ensureDir(dir);
    return dir;
  }

  /**
   * Create a new session
   */
  createSession(
    id: string,
    mission: string,
    doers: string[],
    budget: number
  ): ArenaSession {
    const session: ArenaSession = {
      id,
      mission,
      doers,
      budget,
      turnsUsed: 0,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const dir = this.sessionDir(id);
    writeFileSync(join(dir, 'session.json'), JSON.stringify(session, null, 2));

    // Initialize empty files
    writeFileSync(join(dir, 'transcript.jsonl'), '');
    writeFileSync(join(dir, 'decision-log.jsonl'), '');
    writeFileSync(join(dir, 'task-board.json'), JSON.stringify({ tasks: [] }, null, 2));
    writeFileSync(join(dir, 'budget-report.json'), JSON.stringify({ entries: [] }, null, 2));

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ArenaSession | null {
    const sessionFile = join(this.sessionDir(sessionId), 'session.json');
    if (!existsSync(sessionFile)) {
      return null;
    }
    return JSON.parse(readFileSync(sessionFile, 'utf-8'));
  }

  /**
   * Update session
   */
  updateSession(sessionId: string, updates: Partial<ArenaSession>): ArenaSession | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const updated = {
      ...session,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(
      join(this.sessionDir(sessionId), 'session.json'),
      JSON.stringify(updated, null, 2)
    );

    return updated;
  }

  /**
   * List all sessions
   */
  listSessions(): ArenaSession[] {
    if (!existsSync(this.baseDir)) return [];

    const sessions: ArenaSession[] = [];
    const dirs = readdirSync(this.baseDir, { withFileTypes: true });

    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const session = this.getSession(dir.name);
        if (session) {
          sessions.push(session);
        }
      }
    }

    return sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Append message to transcript
   */
  appendMessage(sessionId: string, message: ArenaMessage): void {
    const file = join(this.sessionDir(sessionId), 'transcript.jsonl');
    appendFileSync(file, JSON.stringify(message) + '\n');
  }

  /**
   * Get all messages for a session
   */
  getMessages(sessionId: string): ArenaMessage[] {
    const file = join(this.sessionDir(sessionId), 'transcript.jsonl');
    if (!existsSync(file)) return [];

    const content = readFileSync(file, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }

  /**
   * Append to decision log
   */
  appendDecision(
    sessionId: string,
    decision: { timestamp: string; issue: string; ruling: string; context: string }
  ): void {
    const file = join(this.sessionDir(sessionId), 'decision-log.jsonl');
    appendFileSync(file, JSON.stringify(decision) + '\n');
  }

  /**
   * Update budget report
   */
  updateBudget(sessionId: string, entries: ArenaBudgetEntry[]): void {
    const file = join(this.sessionDir(sessionId), 'budget-report.json');
    writeFileSync(file, JSON.stringify({ entries, updatedAt: new Date().toISOString() }, null, 2));
  }

  /**
   * Export session to markdown
   */
  exportToMarkdown(sessionId: string): string {
    const session = this.getSession(sessionId);
    if (!session) return '';

    const messages = this.getMessages(sessionId);

    let md = `# Arena Session: ${session.id.slice(0, 8)}\n\n`;
    md += `**Mission:** ${session.mission}\n`;
    md += `**DOERs:** ${session.doers.join(', ')}\n`;
    md += `**Status:** ${session.status}\n`;
    md += `**Turns:** ${session.turnsUsed}/${session.budget}\n`;
    md += `**Created:** ${session.createdAt}\n\n`;
    md += `---\n\n`;
    md += `## Transcript\n\n`;

    for (const msg of messages) {
      md += `### ${msg.from} → ${msg.to} (${msg.type})\n`;
      md += `*${msg.timestamp}*\n\n`;
      md += `${msg.content}\n\n`;
      md += `---\n\n`;
    }

    return md;
  }
}
