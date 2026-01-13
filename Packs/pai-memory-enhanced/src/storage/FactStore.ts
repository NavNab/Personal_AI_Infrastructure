/**
 * Fact Store - permanent memory storage
 *
 * Stores validated facts as JSONL, supporting queries by
 * key, tags, and importance level.
 */

import { join } from 'path';
import { appendJsonl, readJsonl } from './JsonlStore';
import { getMemoryDir } from '../config/defaults';
import type { Fact, FactImportance } from '../schema/Fact';
import { createFact } from '../schema/Fact';

export class FactStore {
  private filePath: string;

  constructor() {
    const memoryDir = getMemoryDir();
    this.filePath = join(memoryDir, 'validated-facts.jsonl');
  }

  add(
    key: string,
    value: string,
    tags: string[] = [],
    importance: FactImportance = 'medium'
  ): Fact {
    const fact = createFact(key, value, tags, importance);
    appendJsonl(this.filePath, fact);
    return fact;
  }

  list(query?: string, limit: number = 50): Fact[] {
    let facts = readJsonl<Fact>(this.filePath);

    if (query) {
      const q = query.toLowerCase();
      facts = facts.filter((f) => JSON.stringify(f).toLowerCase().includes(q));
    }

    // Most recent first
    facts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return facts.slice(0, limit);
  }

  count(): number {
    return readJsonl<Fact>(this.filePath).length;
  }

  getByKey(key: string): Fact[] {
    return readJsonl<Fact>(this.filePath).filter((f) => f.key === key);
  }

  getByTags(tags: string[]): Fact[] {
    return readJsonl<Fact>(this.filePath).filter((f) =>
      tags.some((tag) => f.tags.includes(tag))
    );
  }

  getByImportance(importance: FactImportance): Fact[] {
    return readJsonl<Fact>(this.filePath).filter((f) => f.importance === importance);
  }
}
