# PAI Memory Enhanced - Installation Guide

**This guide is designed for AI agents installing this pack into a user's PAI infrastructure.**

---

## AI Agent Instructions

**This is a wizard-style installation.** Use Claude Code's native tools:

1. **Bash/Read/Write** - For actual installation
2. **TodoWrite** - For progress tracking
3. **VERIFY.md** - For final validation

### Welcome Message

```
"I'm installing pai-memory-enhanced - hypothesis validation and confidence scoring for PAI MEMORY.
This adds the ability to track observations as hypotheses that promote to facts via repeated confirmation.
Let me analyze your system and install the pack."
```

---

## Phase 1: System Analysis

**Execute BEFORE any file operations.**

### 1.1 Run These Commands

```bash
# Resolve PAI_DIR
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
echo "PAI_DIR: $PAI_DIR"

# Check Bun
which bun && bun --version || echo "❌ Bun NOT installed - required"

# Check MEMORY directory
if [ -d "$PAI_DIR/MEMORY" ]; then
  echo "✓ MEMORY directory exists"
else
  echo "⚠️ MEMORY directory not found - will create"
fi

# Check for existing pack
if [ -d "$PAI_DIR/Packs/pai-memory-enhanced" ]; then
  echo "⚠️ Existing pai-memory-enhanced found - will overwrite"
else
  echo "✓ Clean install"
fi

# Check settings.json location
SETTINGS_FILE="$PAI_DIR/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
  echo "✓ settings.json found at $SETTINGS_FILE"
elif [ -L "$SETTINGS_FILE" ]; then
  REAL_SETTINGS=$(readlink "$SETTINGS_FILE")
  echo "✓ settings.json is symlink to $REAL_SETTINGS"
else
  echo "⚠️ settings.json not found"
fi
```

---

## Phase 2: Installation

### 2.1 Create Directory Structure

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"

# Create Packs directory if needed
mkdir -p "$PAI_DIR/Packs"

# Create MEMORY directory if needed
mkdir -p "$PAI_DIR/MEMORY"
```

### 2.2 Copy Pack Files

Copy the entire pack from source to PAI:

```bash
# From the repo location
SOURCE_DIR="/path/to/Personal_AI_Infrastructure/Packs/pai-memory-enhanced"
DEST_DIR="$PAI_DIR/Packs/pai-memory-enhanced"

# Copy pack (excluding node_modules)
rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"
cp -r "$SOURCE_DIR/src" "$DEST_DIR/"
cp -r "$SOURCE_DIR/docs" "$DEST_DIR/" 2>/dev/null || true
cp "$SOURCE_DIR/package.json" "$DEST_DIR/"
cp "$SOURCE_DIR/tsconfig.json" "$DEST_DIR/"
cp "$SOURCE_DIR/README.md" "$DEST_DIR/"
cp "$SOURCE_DIR/VERIFY.md" "$DEST_DIR/"
```

### 2.3 Install Dependencies

```bash
cd "$PAI_DIR/Packs/pai-memory-enhanced"
bun install
```

### 2.4 Create Hook Wrappers

Create wrapper hooks in `$PAI_DIR/hooks/` that call the pack:

**File: `$PAI_DIR/hooks/memory-enhanced-session-start.ts`**

```typescript
#!/usr/bin/env bun
/**
 * PAI Memory Enhanced - Session Start Hook
 * Loads bootstrap context at session start
 */

import { join } from 'path';
import { homedir } from 'os';

const PAI_DIR = process.env.PAI_DIR || join(homedir(), '.claude');
const PACK_DIR = join(PAI_DIR, 'Packs', 'pai-memory-enhanced');

async function main() {
  try {
    const { sessionStartHook, formatBootstrapSummary } = await import(
      join(PACK_DIR, 'src', 'hooks', 'SessionStart.hook.ts')
    );

    const result = await sessionStartHook();
    const summary = formatBootstrapSummary(result);

    // Output for PAI hook system
    console.log(`<system-reminder>\nPAI Memory Enhanced - Session Context\n\n${summary}\n</system-reminder>`);
  } catch (error) {
    console.error('Memory enhanced session start failed:', error);
  }
}

main();
```

**File: `$PAI_DIR/hooks/memory-enhanced-session-end.ts`**

```typescript
#!/usr/bin/env bun
/**
 * PAI Memory Enhanced - Session End Hook
 * Creates handoff for session continuity
 */

import { join } from 'path';
import { homedir } from 'os';

const PAI_DIR = process.env.PAI_DIR || join(homedir(), '.claude');
const PACK_DIR = join(PAI_DIR, 'Packs', 'pai-memory-enhanced');

async function main() {
  try {
    const { sessionEndHook } = await import(
      join(PACK_DIR, 'src', 'hooks', 'SessionEnd.hook.ts')
    );

    const input = JSON.parse(process.argv[2] || '{}');
    await sessionEndHook(input);
  } catch (error) {
    console.error('Memory enhanced session end failed:', error);
  }
}

main();
```

**File: `$PAI_DIR/hooks/memory-enhanced-daily-validation.ts`**

```typescript
#!/usr/bin/env bun
/**
 * PAI Memory Enhanced - Daily Validation Hook
 * Sweeps expired hypotheses, promotes confident ones
 */

import { join } from 'path';
import { homedir } from 'os';

const PAI_DIR = process.env.PAI_DIR || join(homedir(), '.claude');
const PACK_DIR = join(PAI_DIR, 'Packs', 'pai-memory-enhanced');

async function main() {
  try {
    const { dailyValidationHook, formatValidationSummary } = await import(
      join(PACK_DIR, 'src', 'hooks', 'DailyValidation.hook.ts')
    );

    const result = await dailyValidationHook();
    console.log(formatValidationSummary(result));
  } catch (error) {
    console.error('Memory enhanced daily validation failed:', error);
  }
}

main();
```

### 2.5 Register Hooks in settings.json

Add to `$PAI_DIR/settings.json` (or the file it symlinks to):

```json
{
  "hooks": {
    "SessionStart": [
      "$PAI_DIR/hooks/memory-enhanced-session-start.ts"
    ],
    "Stop": [
      "$PAI_DIR/hooks/memory-enhanced-session-end.ts"
    ]
  }
}
```

**Note:** If hooks already exist, APPEND to the arrays, don't replace.

---

## Phase 3: Verification

Run the verification checklist from VERIFY.md:

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
cd "$PAI_DIR/Packs/pai-memory-enhanced"

# Test CLI
bun run src/cli/cli.ts --version

# Test hypothesis creation
bun run src/cli/cli.ts hypothesis "Test installation"

# Test listing
bun run src/cli/cli.ts hypothesis --list

# Test bootstrap
bun run src/cli/cli.ts bootstrap
```

---

## Quick Reference

### CLI Location
```bash
$PAI_DIR/Packs/pai-memory-enhanced/src/cli/cli.ts
```

### Alias (add to shell profile)
```bash
alias pai-memory="bun run $PAI_DIR/Packs/pai-memory-enhanced/src/cli/cli.ts"
```

### Storage Location
```
$PAI_DIR/MEMORY/
├── hypotheses.jsonl      # Hypothesis tracking
├── validated-facts.jsonl # Promoted facts
├── cues.json             # Context triggers
└── audit.jsonl           # State changes
```

---

## Troubleshooting

### "Cannot find module" errors
Ensure dependencies are installed:
```bash
cd $PAI_DIR/Packs/pai-memory-enhanced && bun install
```

### Hooks not firing
Check settings.json has correct paths and hooks are executable:
```bash
chmod +x $PAI_DIR/hooks/memory-enhanced-*.ts
```

### PAI_DIR not set
Add to shell profile:
```bash
export PAI_DIR="$HOME/.claude"
```
