# PAI Memory Enhanced

> Hypothesis validation, confidence scoring, and cross-LLM export for PAI MEMORY

## Overview

PAI Memory Enhanced adds validation capabilities to the PAI MEMORY system:

- **Hypothesis → Fact lifecycle**: Observations start as hypotheses, promote to facts via confidence
- **Confidence scoring**: Frequency-based - more observations = higher confidence
- **Auto-expiry**: Hypotheses expire after configurable days if not validated
- **Cross-LLM export**: Export memory to JSON for use with any LLM
- **Cue triggers**: Context-aware hypothesis surfacing

## Storage

All data integrates into existing PAI MEMORY structure at `$PAI_DIR/MEMORY/`:

```
$PAI_DIR/MEMORY/
├── hypotheses.jsonl      # NEW: Hypothesis tracking with expiry
├── validated-facts.jsonl # NEW: Promoted facts
├── cues.json             # NEW: Context triggers
├── audit.jsonl           # NEW: State change audit log
├── sessions/             # Existing PAI
├── learnings/            # Existing PAI
├── State/                # Existing PAI
└── ...
```

## Quick Start

```bash
cd Packs/pai-memory-enhanced
bun install

# Add a hypothesis (starts with low confidence)
bun run src/cli/cli.ts hypothesis "User prefers dark mode"

# Observe again (confidence increases)
bun run src/cli/cli.ts hypothesis "User prefers dark mode"

# Run sweep (expire old, promote confident)
bun run src/cli/cli.ts sweep

# Export for cross-LLM use
bun run src/cli/cli.ts export -o memory-backup.json
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `hypothesis "<statement>"` | Add/reinforce hypothesis |
| `hypothesis --list` | List hypotheses with confidence |
| `fact <key> <value>` | Add validated fact directly |
| `fact --list` | List facts |
| `sweep` | Expire old hypotheses, promote confident ones |
| `export` | Export to JSON |
| `import <file>` | Import from JSON |
| `bootstrap` | Show session context |
| `cues` | List cue triggers |

## Confidence System

Hypotheses gain confidence through repeated observation:

```
confidence = observation_count / promotion_threshold

Default threshold: 5 observations
Promotion: confidence >= 1.0 → fact
Expiry: 7 days without promotion → closed
```

## Environment Variables

For multi-LLM tracking:

| Variable | Description |
|----------|-------------|
| `PAI_SESSION_ID` | Session identifier |
| `PAI_MODEL_ID` | Model identifier |
| `PAI_LLM_PROVIDER` | Provider name |

## PAI Hook Integration

After installation via INSTALL.md, hooks are registered in `$PAI_DIR/settings.json`:

```json
{
  "hooks": {
    "SessionStart": ["bun run $PAI_DIR/hooks/memory-enhanced-session-start.ts"],
    "Stop": ["bun run $PAI_DIR/hooks/memory-enhanced-session-end.ts"]
  }
}
```

The wrapper hooks at `$PAI_DIR/hooks/memory-enhanced-*.ts` import from the installed skill at `$PAI_DIR/skills/MemoryEnhanced/`.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed design.

## License

Apache-2.0
