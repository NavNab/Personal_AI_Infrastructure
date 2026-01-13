/**
 * Base JSONL storage operations
 *
 * Provides low-level JSONL file operations for append-only
 * data storage with robust error handling.
 */

import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function ensureFile(filePath: string): void {
  ensureDir(filePath);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, '');
  }
}

export function appendJsonl<T>(filePath: string, record: T): void {
  ensureFile(filePath);
  appendFileSync(filePath, JSON.stringify(record) + '\n');
}

export function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const items: T[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj === 'object' && obj !== null) {
        items.push(obj as T);
      }
    } catch {
      // Skip invalid lines
    }
  }

  return items;
}

export function writeJsonl<T>(filePath: string, items: T[]): void {
  ensureDir(filePath);
  const content = items.map((item) => JSON.stringify(item)).join('\n') + (items.length ? '\n' : '');
  writeFileSync(filePath, content);
}

export function readJson<T>(filePath: string, defaultValue: T): T {
  if (!existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return defaultValue;
  }
}

export function writeJson<T>(filePath: string, data: T): void {
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}
