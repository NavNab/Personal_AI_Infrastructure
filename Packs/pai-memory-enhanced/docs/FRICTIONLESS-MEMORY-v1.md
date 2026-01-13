# Frictionless Memory v1.0

**Built:** 2026-01-13
**Turns Used:** 18/1000
**Status:** Production Ready ✅

---

## The Problem

Claude Code loses context between sessions. Users had to repeatedly tell Claude their preferences, decisions, and corrections. Raw session data was captured but never synthesized into actionable knowledge.

## The Solution

Automatic learning extraction from conversation transcripts using local LLMs, with zero user friction.

---

## Architecture

```
Session End → Stop Hook → Pipeline → Persistent Memory
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│  stop-hook-learning-extractor.ts                             │
│  ──────────────────────────────────────────                  │
│  Receives: { session_id, transcript_path }                   │
└──────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│  TranscriptReader.ts                                         │
│  ──────────────────────────────────────────                  │
│  • Parses JSONL transcripts                                  │
│  • Extracts text from content blocks                         │
│  • Achieves 97-98% token reduction                           │
└──────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│  SignalSampler.ts                                            │
│  ──────────────────────────────────────────                  │
│  • Scores messages by learning signals                       │
│  • Priority: preference > decision > correction              │
│  • Fits to 18K token budget                                  │
└──────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│  LearningExtractor.ts                                        │
│  ──────────────────────────────────────────                  │
│  • Calls local LLM via Ollama HTTP API                       │
│  • Model fallback: qwen3:4b → deepseek-r1:8b                 │
│  • Multi-strategy JSON parsing                               │
│  • Filters USER messages only                                │
└──────────────────────────────────────────────────────────────┘
     │
     ├────────────────────────────────────┐
     ▼                                    ▼
┌──────────────────────┐    ┌─────────────────────────────────┐
│  SessionEnd.hook.ts  │    │  HandoffGenerator.ts            │
│  ────────────────    │    │  ─────────────────              │
│  → hypotheses.jsonl  │    │  → handoffs/latest.md           │
│  (learnings saved)   │    │  → handoffs/YYYY-MM-DD_*.md     │
└──────────────────────┘    └─────────────────────────────────┘
```

---

## Files Created

| File | Location | Lines | Purpose |
|------|----------|-------|---------|
| `TranscriptReader.ts` | `lib/extractors/` | 200 | Parse JSONL transcripts |
| `SignalSampler.ts` | `lib/extractors/` | 220 | Smart message sampling |
| `LearningExtractor.ts` | `lib/extractors/` | 560 | LLM extraction pipeline |
| `HandoffGenerator.ts` | `lib/extractors/` | 270 | Handoff generation |
| `stop-hook-learning-extractor.ts` | `hooks/` | 215 | Wires pipeline |

---

## Performance

| Metric | Value |
|--------|-------|
| Token reduction | 97-98% |
| Extraction time | ~8 seconds |
| Primary model | qwen3:4b (13.6s) |
| Fallback model | deepseek-r1:8b (30.4s) |
| Timeout | 45 seconds |

---

## Signal Detection Patterns

```typescript
const LEARNING_SIGNALS = {
  preference: [
    /\bi\s+(prefer|like|want|need|always|never)\b/i,
    /\bkeep\s+it\s+simple/i,
    /\bdon['']t\s+(want|like|need)/i,
  ],
  decision: [
    /\b(let['']s|we['']ll|we\s+should|decided|going\s+to)\b/i,
  ],
  correction: [
    /\b(no|not|actually|wrong|incorrect)\b/i,
    /\bthe\s+(question|point|issue)\s+is\b/i,
  ],
};
```

---

## JSON Parsing Strategies

1. **Code blocks**: Extract from \`\`\`json...\`\`\`
2. **Balanced objects**: Find properly nested `{...}`
3. **Direct arrays**: Handle `[...]` without wrapper
4. **Greedy match**: Last resort `{.*}`

Pre-processing:
- Strip `<think>...</think>` tags (deepseek-r1)
- Remove "Thinking..." prefix (qwen3)

---

## Configuration

Settings in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "bun run $PAI_DIR/hooks/stop-hook-learning-extractor.ts"
      }]
    }]
  }
}
```

---

## Output Examples

### Handoff (MEMORY/handoffs/latest.md)

```markdown
# Session Handoff

**Created:** 2026-01-13
**Session:** de8e78e6...
**Topic:** Feature Development

## Learnings Captured

### Preferences

- 🟢 User prefers simple implementations first *(evidence: "keep it simple...")*
```

### Hypothesis (MEMORY/hypotheses.jsonl)

```json
{
  "statement": "User prefers simple implementations first",
  "tags": ["preference", "session-learning"],
  "observationCount": 1,
  "status": "open"
}
```

---

## Research Journey

| Phase | Turns | Focus |
|-------|-------|-------|
| Research | 1-11 | Transcript structure, LLM testing, prompt design |
| Implementation | 12-16 | Build all components |
| Hardening | 17-18 | Model fallback, JSON parsing |

**Key discoveries:**
- Transcripts at `~/.claude/projects/{hash}/{session}.jsonl`
- Content blocks: `thinking` (skip), `text` (keep), `tool_use` (skip)
- qwen3:4b faster (13s) but sometimes ignores format
- deepseek-r1:8b slower (30s) but more reliable
- User-only filtering reduces LLM confusion

---

## Future Enhancements

1. **Claude Haiku fallback** for higher quality
2. **Pattern detection** across sessions
3. **Auto-promotion** (5 observations → fact)
4. **Cross-session analysis**
5. **Local embeddings** for semantic search

---

*Frictionless Memory: Because Claude should remember what matters.*
