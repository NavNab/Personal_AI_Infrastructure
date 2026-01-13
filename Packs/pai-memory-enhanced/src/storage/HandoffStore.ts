/**
 * Handoff Store - session continuity
 *
 * Manages session handoffs to maintain context between
 * AI sessions, enabling seamless continuity.
 */

import { join } from 'path';
import { readJson, writeJson } from './JsonlStore';
import { getMemoryDir } from '../config/defaults';
import type { Handoff } from '../schema/Handoff';
import { createHandoff } from '../schema/Handoff';

export class HandoffStore {
  private filePath: string;

  constructor() {
    const memoryDir = getMemoryDir();
    this.filePath = join(memoryDir, 'handoffs', 'latest.json');
  }

  create(
    projectState: string,
    nextAction: string,
    context: Record<string, unknown> = {},
    memoryCount: number = 0
  ): Handoff {
    const handoff = createHandoff(projectState, nextAction, context, memoryCount);
    writeJson(this.filePath, handoff);
    return handoff;
  }

  load(): Handoff | null {
    return readJson<Handoff | null>(this.filePath, null);
  }

  exists(): boolean {
    return this.load() !== null;
  }

  clear(): void {
    writeJson(this.filePath, null);
  }
}
