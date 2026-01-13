/**
 * Cue Matcher - context-aware hypothesis surfacing
 *
 * Evaluates triggers against current context to determine
 * which hypotheses or facts should be surfaced.
 * Supports path-based, command-based, and time-based triggers.
 */

import * as fs from 'fs';
import { join } from 'path';
import { getMemoryDir } from '../config/defaults';
import type { Cue, CueTrigger, CueContext } from '../schema/Cue';

export interface CueMatchResult {
  cue: Cue;
  action: Cue['action'];
  matchedTriggers: string[];
}

export interface ExtendedCue extends Cue {
  id?: string;
  createdAt?: string;
  enabled?: boolean;
}

export class CueMatcher {
  private cuesFile: string;
  private memoryDir: string;

  constructor() {
    this.memoryDir = getMemoryDir();
    this.cuesFile = join(this.memoryDir, 'cues.json');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  /**
   * Load all cues from storage
   */
  loadCues(): ExtendedCue[] {
    if (!fs.existsSync(this.cuesFile)) {
      return [];
    }
    try {
      const content = fs.readFileSync(this.cuesFile, 'utf-8');
      return JSON.parse(content) as ExtendedCue[];
    } catch {
      return [];
    }
  }

  /**
   * Save cues to storage
   */
  saveCues(cues: ExtendedCue[]): void {
    fs.writeFileSync(this.cuesFile, JSON.stringify(cues, null, 2));
  }

  /**
   * Add a new cue
   */
  addCue(triggers: CueTrigger, action: Cue['action']): ExtendedCue {
    const cue: ExtendedCue = {
      triggers,
      action,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      enabled: true,
    };

    const cues = this.loadCues();
    cues.push(cue);
    this.saveCues(cues);

    return cue;
  }

  /**
   * Match cues against current context
   * Returns all cues whose triggers match the provided context
   */
  match(context: CueContext): CueMatchResult[] {
    const cues = this.loadCues();
    const matches: CueMatchResult[] = [];

    const cwd = (context.cwd || '').toLowerCase();
    const cmd = (context.command || '').toLowerCase();
    const time = context.time || this.getCurrentTime();

    for (const cue of cues) {
      if (cue.enabled === false) continue;

      const matchedTriggers: string[] = [];
      let ok = true;
      const trig = cue.triggers;

      // Check pathContains
      if (trig.pathContains) {
        if (cwd.includes(trig.pathContains.toLowerCase())) {
          matchedTriggers.push('pathContains');
        } else {
          ok = false;
        }
      }

      // Check commandContains
      if (trig.commandContains) {
        if (cmd.includes(trig.commandContains.toLowerCase())) {
          matchedTriggers.push('commandContains');
        } else {
          ok = false;
        }
      }

      // Check timeBetween
      if (trig.timeBetween) {
        const [start, end] = trig.timeBetween;
        if (time >= start && time <= end) {
          matchedTriggers.push('timeBetween');
        } else {
          ok = false;
        }
      }

      if (ok && matchedTriggers.length > 0) {
        matches.push({
          cue,
          action: cue.action,
          matchedTriggers,
        });
      } else if (ok && this.hasNoTriggers(trig)) {
        // Cue with no triggers always matches (global cue)
        matches.push({
          cue,
          action: cue.action,
          matchedTriggers: ['always'],
        });
      }
    }

    return matches;
  }

  /**
   * Get actions only (simplified output)
   */
  matchActions(context: CueContext): Cue['action'][] {
    return this.match(context).map(r => r.action);
  }

  /**
   * Check if a cue has no triggers defined
   */
  private hasNoTriggers(triggers: CueTrigger): boolean {
    return !triggers.pathContains &&
           !triggers.commandContains &&
           !triggers.timeBetween;
  }

  /**
   * Get current time in HH:MM format
   */
  private getCurrentTime(): string {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }

  /**
   * Enable or disable a cue
   */
  toggleCue(cueId: string, enabled: boolean): boolean {
    const cues = this.loadCues();
    const cue = cues.find(c => c.id === cueId);
    if (!cue) return false;

    cue.enabled = enabled;
    this.saveCues(cues);
    return true;
  }

  /**
   * Remove a cue
   */
  removeCue(cueId: string): boolean {
    const cues = this.loadCues();
    const index = cues.findIndex(c => c.id === cueId);
    if (index === -1) return false;

    cues.splice(index, 1);
    this.saveCues(cues);
    return true;
  }

  /**
   * Get all cues matching a specific trigger type
   */
  getCuesByTriggerType(triggerType: keyof CueTrigger): ExtendedCue[] {
    return this.loadCues().filter(cue => cue.triggers[triggerType] !== undefined);
  }
}
