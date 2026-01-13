# Installation Guide

## Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- PAI installed with `$PAI_DIR` set

## Installation

### 1. Install Dependencies

```bash
cd Packs/pai-memory-enhanced
bun install
```

### 2. Verify PAI_DIR

Ensure `PAI_DIR` is set (defaults to `~/.claude` if not):

```bash
echo $PAI_DIR
```

### 3. Test CLI

```bash
bun run src/cli/cli.ts --help
```

## PAI Hook Integration

To enable automatic hypothesis capture and validation, add hooks to your PAI configuration:

### Option A: Add to .pairc

```yaml
hooks:
  session_start:
    - pai-memory-enhanced/hooks/SessionStart.hook.ts
  session_end:
    - pai-memory-enhanced/hooks/SessionEnd.hook.ts
```

### Option B: Manual Hook Registration

Copy hooks to your PAI hooks directory:

```bash
cp src/hooks/*.ts $PAI_DIR/hooks/
```

## Verify Installation

```bash
# Check CLI
bun run src/cli/cli.ts --version

# Add test hypothesis
bun run src/cli/cli.ts hypothesis "Test hypothesis"

# List hypotheses
bun run src/cli/cli.ts hypothesis --list

# Show bootstrap context
bun run src/cli/cli.ts bootstrap
```

## Storage Location

All data is stored in `$PAI_DIR/MEMORY/`:

```
$PAI_DIR/MEMORY/
├── hypotheses.jsonl      # Hypothesis tracking
├── validated-facts.jsonl # Promoted facts
├── cues.json             # Context triggers
└── audit.jsonl           # State changes
```

## Troubleshooting

### PAI_DIR not set

Set it in your shell profile:

```bash
export PAI_DIR="$HOME/.claude"
```

### TypeScript errors

Ensure bun-types is installed:

```bash
bun add -d bun-types
```

### MEMORY directory doesn't exist

The directory is created automatically on first use. To create manually:

```bash
mkdir -p $PAI_DIR/MEMORY
```
