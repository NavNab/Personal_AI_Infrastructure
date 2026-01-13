# Architecture

## 4-Layer Design

```
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 4: CROSS-LLM INTERFACE                                        │
│ Export/import JSON, environment variables, bootstrap slice          │
├─────────────────────────────────────────────────────────────────────┤
│ LAYER 3: VALIDATION ENGINE                                          │
│ Confidence calculator, hypothesis sweeper, cue matcher              │
├─────────────────────────────────────────────────────────────────────┤
│ LAYER 2: STORAGE (JSONL)                                            │
│ facts.jsonl, hypotheses.jsonl, episodes/, handoffs/, projects/      │
├─────────────────────────────────────────────────────────────────────┤
│ LAYER 1: HOOKS                                                      │
│ SessionStart, PostContextCapture, SessionEnd, DailyValidation       │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
Observation → PostContextCapture → Hypothesis (confidence: 0.2)
                    ↓
            Repeated observation → Confidence: 0.4, 0.6, 0.8
                    ↓
            DailyValidation → Confidence ≥ 1.0 → Promote to Fact
                    ↓
            ExportEngine → JSON → ImportEngine (other LLM)
```

## Key Components

### Schema (src/schema/)
- `Fact.ts` - Permanent memory items
- `Hypothesis.ts` - Temporary items with expiry
- `Cue.ts` - Context triggers
- `BootstrapSlice.ts` - Session startup context

### Storage (src/storage/)
- `JsonlStore.ts` - Base JSONL operations
- `FactStore.ts` - Facts CRUD
- `HypothesisStore.ts` - Hypotheses with sweep

### Validation (src/validation/)
- `ConfidenceCalculator.ts` - Frequency-based scoring
- `HypothesisSweeper.ts` - Expiry and promotion
- `CueMatcher.ts` - Context matching

### Hooks (src/hooks/)
- `SessionStart.hook.ts` - Bootstrap loading
- `PostContextCapture.hook.ts` - Auto-hypothesis
- `SessionEnd.hook.ts` - Handoff creation
- `DailyValidation.hook.ts` - Sweep runner

### Export (src/export/)
- `ExportEngine.ts` - Memory → JSON
- `ImportEngine.ts` - JSON → Memory
- `EnvVarReader.ts` - PAI environment variables

## Confidence Algorithm

```
confidence = observation_count / promotion_threshold

Default threshold: 5 observations
Promotion trigger: confidence >= 1.0
```

## Integration with PAI MEMORY

This pack adds files to the existing PAI MEMORY structure at `$PAI_DIR/MEMORY/`:

| New File | Purpose |
|----------|---------|
| `hypotheses.jsonl` | Temporary observations with expiry |
| `validated-facts.jsonl` | Promoted high-confidence facts |
| `cues.json` | Context-aware triggers |
| `audit.jsonl` | State change log |
