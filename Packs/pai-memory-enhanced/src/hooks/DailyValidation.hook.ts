/**
 * Daily Validation Hook - sweep expired hypotheses and promote confident ones
 *
 * Should run once per day (or on demand) to maintain memory hygiene
 * by expiring old hypotheses and promoting high-confidence ones.
 */

import { CONFIG } from '../config/defaults';
import { HypothesisSweeper, type SweepResult } from '../validation/HypothesisSweeper';
import { EpisodeStore } from '../storage/EpisodeStore';

export interface FullSweepResult extends SweepResult {
  timestamp: string;
  duration: number;
}

export interface ValidationResult extends FullSweepResult {}

export async function dailyValidationHook(): Promise<ValidationResult> {
  const startTime = Date.now();
  const episodeStore = new EpisodeStore();
  const sweeper = new HypothesisSweeper({ closeOnExpiry: CONFIG.closeOnExpiry });

  // Run the sweep
  const sweepResult = sweeper.sweep();

  const duration = Date.now() - startTime;

  // Log validation event
  episodeStore.log('daily_validation', {
    ...sweepResult,
    duration,
  });

  return {
    ...sweepResult,
    timestamp: new Date().toISOString(),
    duration,
  };
}

export function formatValidationSummary(result: ValidationResult): string {
  const lines: string[] = [
    '=== Daily Validation ===',
    `Checked: ${result.checked} hypotheses`,
    `Expired: ${result.expired}`,
    `Promoted: ${result.promoted}`,
    `Facts created: ${result.factsCreated}`,
    `Duration: ${result.duration}ms`,
  ];
  return lines.join('\n');
}
