/**
 * Episode Store - daily session logs
 *
 * Records session events in daily JSONL files for auditing
 * and session continuity tracking.
 */

import { join } from 'path';
import { appendJsonl, readJsonl } from './JsonlStore';
import { getMemoryDir } from '../config/defaults';
import type { EpisodeEvent } from '../schema/Episode';
import { createEpisodeEvent } from '../schema/Episode';

export class EpisodeStore {
  private baseDir: string;

  constructor() {
    const memoryDir = getMemoryDir();
    this.baseDir = join(memoryDir, 'episodes');
  }

  private getFilePath(date: Date = new Date()): string {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return join(this.baseDir, `${dateStr}.jsonl`);
  }

  log(type: string, payload: Record<string, unknown> = {}): EpisodeEvent {
    const event = createEpisodeEvent(type, payload);
    appendJsonl(this.getFilePath(), event);
    return event;
  }

  listToday(): EpisodeEvent[] {
    return readJsonl<EpisodeEvent>(this.getFilePath());
  }

  listDate(date: Date): EpisodeEvent[] {
    return readJsonl<EpisodeEvent>(this.getFilePath(date));
  }

  listRange(startDate: Date, endDate: Date): EpisodeEvent[] {
    const events: EpisodeEvent[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      events.push(...this.listDate(current));
      current.setDate(current.getDate() + 1);
    }

    return events;
  }

  countToday(): number {
    return this.listToday().length;
  }

  getByType(type: string, date?: Date): EpisodeEvent[] {
    const events = date ? this.listDate(date) : this.listToday();
    return events.filter((e) => e.type === type);
  }
}
