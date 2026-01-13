/**
 * Cue interface - context-aware triggers
 *
 * Surfaces relevant hypotheses based on context (path, command, time).
 */

export interface CueTrigger {
  pathContains?: string; // Trigger when CWD contains string
  commandContains?: string; // Trigger on specific command
  timeBetween?: [string, string]; // Time window ["09:00", "17:00"]
}

export interface Cue {
  triggers: CueTrigger;
  action: Record<string, unknown>;
}

export interface CueContext {
  cwd?: string;
  command?: string;
  time?: string; // HH:MM format
}

/**
 * Match cues against current context
 *
 * Simple rule-based matcher for context triggers.
 */
export function matchCues(cues: Cue[], context: CueContext): Cue['action'][] {
  const matches: Cue['action'][] = [];
  const cwd = (context.cwd ?? '').toLowerCase();
  const cmd = (context.command ?? '').toLowerCase();
  const t = context.time ?? new Date().toISOString().slice(11, 16);

  for (const cue of cues) {
    const trig = cue.triggers;
    let ok = true;

    if (trig.pathContains && !cwd.includes(trig.pathContains.toLowerCase())) {
      ok = false;
    }
    if (trig.commandContains && !cmd.includes(trig.commandContains.toLowerCase())) {
      ok = false;
    }
    if (trig.timeBetween) {
      const [start, end] = trig.timeBetween;
      ok = ok && t >= start && t <= end;
    }

    if (ok) {
      matches.push(cue.action);
    }
  }

  return matches;
}
