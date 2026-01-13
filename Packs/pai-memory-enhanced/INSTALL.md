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

## Upgrade Path

**If upgrading from a previous version, follow these steps:**

### Detect Upgrade vs Fresh Install

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"

if [ -d "$PAI_DIR/skills/MemoryEnhanced" ]; then
  echo "UPGRADE: Existing MemoryEnhanced found"
  ls -la "$PAI_DIR/skills/MemoryEnhanced/"
else
  echo "FRESH INSTALL: No existing MemoryEnhanced"
fi
```

### What Gets Preserved During Upgrade

| Item | Preserved? | Notes |
|------|------------|-------|
| `MEMORY/hypotheses.jsonl` | Yes | Your hypothesis data - NOT overwritten |
| `MEMORY/validated-facts.jsonl` | Yes | Your facts data - NOT overwritten |
| `MEMORY/cues.json` | Yes | Your cue triggers - NOT overwritten |
| `MEMORY/audit.jsonl` | Yes | Audit log - NOT overwritten |
| Pack source files | Replaced | New version installed |
| Hook wrappers | Replaced | Updated with new version |

### Upgrade Steps

**1. Backup current installation:**
```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
BACKUP_DIR="$HOME/.pai-backups/memory-enhanced-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r "$PAI_DIR/skills/MemoryEnhanced" "$BACKUP_DIR/"
cp -r "$PAI_DIR/MEMORY" "$BACKUP_DIR/" 2>/dev/null
echo "Backup created: $BACKUP_DIR"
```

**2. Install new version:**
Follow Phase 2 (Installation) steps below.

**3. Verify upgrade:**
```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
bun run "$PAI_DIR/skills/MemoryEnhanced/cli/cli.ts" --version
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
which bun && bun --version || echo "Bun NOT installed - required"

# Check MEMORY directory
if [ -d "$PAI_DIR/MEMORY" ]; then
  echo "MEMORY directory exists"
else
  echo "MEMORY directory not found - will create"
fi

# Check for existing pack
if [ -d "$PAI_DIR/skills/MemoryEnhanced" ]; then
  echo "Existing MemoryEnhanced found - will overwrite"
else
  echo "Clean install"
fi

# Check settings.json location
SETTINGS_FILE="$PAI_DIR/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
  echo "settings.json found at $SETTINGS_FILE"
elif [ -L "$SETTINGS_FILE" ]; then
  REAL_SETTINGS=$(readlink "$SETTINGS_FILE")
  echo "settings.json is symlink to $REAL_SETTINGS"
else
  echo "settings.json not found"
fi
```

### 1.2 Present Findings

Tell the user what you found:
```
"Here's what I found on your system:
- PAI_DIR: [path]
- Bun: [installed vX.X / NOT INSTALLED - REQUIRED]
- MEMORY directory: [exists / will create]
- Existing pack: [found / clean install]
- settings.json: [found at path / NOT FOUND]"
```

**STOP if Bun is not installed.** Tell the user:
```
"Bun is required for this pack. Install it with:
curl -fsSL https://bun.sh/install | bash
Then restart your terminal and run the installation again."
```

---

## Phase 2: Installation

**Create a TodoWrite list to track progress:**

```json
{
  "todos": [
    {"content": "Create directory structure", "status": "pending", "activeForm": "Creating directory structure"},
    {"content": "Copy skill files", "status": "pending", "activeForm": "Copying skill files"},
    {"content": "Create hook wrappers", "status": "pending", "activeForm": "Creating hook wrappers"},
    {"content": "Register hooks in settings.json", "status": "pending", "activeForm": "Registering hooks"},
    {"content": "Run verification", "status": "pending", "activeForm": "Running verification"}
  ]
}
```

### 2.1 Create Directory Structure

**Mark todo "Create directory structure" as in_progress.**

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"

# Create skills directory if needed
mkdir -p "$PAI_DIR/skills/MemoryEnhanced"

# Create MEMORY directory if needed
mkdir -p "$PAI_DIR/MEMORY"

# Create hooks directory if needed
mkdir -p "$PAI_DIR/hooks"

echo "Directory structure created"
```

**Mark todo as completed.**

### 2.2 Copy Skill Files

**Mark todo "Copy skill files" as in_progress.**

**First, navigate to the pack source directory:**
```bash
cd /path/to/Personal_AI_Infrastructure/Packs/pai-memory-enhanced
```

**Verify you're in the right directory:**
```bash
ls src/cli/cli.ts && echo "Correct directory" || echo "Wrong directory - navigate to pai-memory-enhanced pack"
```

**Copy pack to PAI skills directory:**
```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}" && DEST_DIR="$PAI_DIR/skills/MemoryEnhanced" && rm -rf "$DEST_DIR" && mkdir -p "$DEST_DIR" && cp -r src/cli "$DEST_DIR/" && cp -r src/schema "$DEST_DIR/" && cp -r src/storage "$DEST_DIR/" && cp -r src/validation "$DEST_DIR/" && cp -r src/hooks "$DEST_DIR/" && cp -r src/export "$DEST_DIR/" && cp -r src/config "$DEST_DIR/" && cp src/index.ts "$DEST_DIR/" && echo "Skill files copied to: $DEST_DIR"
```

**Note:** Dependencies (`commander`, `zod`) resolve from Bun's global cache. If you get "Module not found" errors, install globally:
```bash
bun add commander zod -g
```

**Mark todo as completed.**

### 2.3 Create Hook Wrappers

**Mark todo "Create hook wrappers" as in_progress.**

Create wrapper hooks that import from the installed skill.

**File: `$PAI_DIR/hooks/memory-enhanced-session-start.ts`**

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}" && cat > "$PAI_DIR/hooks/memory-enhanced-session-start.ts" << 'HOOKEOF'
#!/usr/bin/env bun
/**
 * PAI Memory Enhanced - Session Start Hook
 * Loads bootstrap context at session start
 */

import { join } from 'path';
import { homedir } from 'os';

const PAI_DIR = process.env.PAI_DIR || join(homedir(), '.claude');
const SKILL_DIR = join(PAI_DIR, 'skills', 'MemoryEnhanced');

async function main() {
  try {
    const { sessionStartHook, formatBootstrapSummary } = await import(
      join(SKILL_DIR, 'hooks', 'SessionStart.hook.ts')
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
HOOKEOF
echo "Created memory-enhanced-session-start.ts"
```

**File: `$PAI_DIR/hooks/memory-enhanced-session-end.ts`**

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}" && cat > "$PAI_DIR/hooks/memory-enhanced-session-end.ts" << 'HOOKEOF'
#!/usr/bin/env bun
/**
 * PAI Memory Enhanced - Session End Hook
 * Creates handoff for session continuity
 */

import { join } from 'path';
import { homedir } from 'os';

const PAI_DIR = process.env.PAI_DIR || join(homedir(), '.claude');
const SKILL_DIR = join(PAI_DIR, 'skills', 'MemoryEnhanced');

async function main() {
  try {
    const { sessionEndHook } = await import(
      join(SKILL_DIR, 'hooks', 'SessionEnd.hook.ts')
    );

    const input = JSON.parse(process.argv[2] || '{}');
    await sessionEndHook(input);
  } catch (error) {
    console.error('Memory enhanced session end failed:', error);
  }
}

main();
HOOKEOF
echo "Created memory-enhanced-session-end.ts"
```

**File: `$PAI_DIR/hooks/memory-enhanced-daily-validation.ts`**

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}" && cat > "$PAI_DIR/hooks/memory-enhanced-daily-validation.ts" << 'HOOKEOF'
#!/usr/bin/env bun
/**
 * PAI Memory Enhanced - Daily Validation Hook
 * Sweeps expired hypotheses, promotes confident ones
 */

import { join } from 'path';
import { homedir } from 'os';

const PAI_DIR = process.env.PAI_DIR || join(homedir(), '.claude');
const SKILL_DIR = join(PAI_DIR, 'skills', 'MemoryEnhanced');

async function main() {
  try {
    const { dailyValidationHook, formatValidationSummary } = await import(
      join(SKILL_DIR, 'hooks', 'DailyValidation.hook.ts')
    );

    const result = await dailyValidationHook();
    console.log(formatValidationSummary(result));
  } catch (error) {
    console.error('Memory enhanced daily validation failed:', error);
  }
}

main();
HOOKEOF
echo "Created memory-enhanced-daily-validation.ts"
```

**Make hooks executable:**
```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}" && chmod +x "$PAI_DIR/hooks/memory-enhanced-"*.ts && echo "Hooks made executable"
```

**Mark todo as completed.**

### 2.4 Register Hooks in settings.json

**Mark todo "Register hooks in settings.json" as in_progress.**

**Check current settings.json structure:**
```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
cat "$PAI_DIR/settings.json" | head -50
```

**Add hooks to settings.json (append to existing arrays, don't replace):**

If settings.json has a `hooks` object with `SessionStart` array:
```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}" && jq '.hooks.SessionStart += ["bun run $PAI_DIR/hooks/memory-enhanced-session-start.ts"]' "$PAI_DIR/settings.json" > /tmp/settings.json && mv /tmp/settings.json "$PAI_DIR/settings.json" && echo "SessionStart hook registered"
```

If settings.json has a `hooks` object with `Stop` array:
```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}" && jq '.hooks.Stop += ["bun run $PAI_DIR/hooks/memory-enhanced-session-end.ts"]' "$PAI_DIR/settings.json" > /tmp/settings.json && mv /tmp/settings.json "$PAI_DIR/settings.json" && echo "Stop hook registered"
```

**Note:** The exact jq command depends on the existing settings.json structure. If hooks don't exist yet, you may need to create the structure first.

**Mark todo as completed.**

---

## Phase 3: Verification

**Mark todo "Run verification" as in_progress.**

Run the verification checklist:

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
cd "$PAI_DIR/skills/MemoryEnhanced"

echo "=== PAI Memory Enhanced Verification ==="

# Test CLI version
echo "Testing CLI..."
bun run cli/cli.ts --version && echo "CLI works" || echo "CLI failed"

# Test hypothesis creation
echo "Testing hypothesis creation..."
bun run cli/cli.ts hypothesis "Test installation" && echo "Hypothesis created" || echo "Hypothesis creation failed"

# Test listing
echo "Testing hypothesis listing..."
bun run cli/cli.ts hypothesis --list && echo "Listing works" || echo "Listing failed"

# Test bootstrap
echo "Testing bootstrap..."
bun run cli/cli.ts bootstrap && echo "Bootstrap works" || echo "Bootstrap failed"

# Check hook files exist
echo "Checking hook files..."
[ -f "$PAI_DIR/hooks/memory-enhanced-session-start.ts" ] && echo "session-start hook exists" || echo "session-start hook MISSING"
[ -f "$PAI_DIR/hooks/memory-enhanced-session-end.ts" ] && echo "session-end hook exists" || echo "session-end hook MISSING"
[ -f "$PAI_DIR/hooks/memory-enhanced-daily-validation.ts" ] && echo "daily-validation hook exists" || echo "daily-validation hook MISSING"

echo "=== Verification Complete ==="
```

**Mark todo as completed when all checks pass.**

---

## Success/Failure Messages

### On Success

```
"PAI Memory Enhanced v2.0.0 installed successfully!

What's available:
- Hypothesis tracking with confidence scoring
- Fact validation through repeated observation
- Session bootstrap context injection
- Cross-LLM memory export/import
- Daily validation sweeps

CLI commands:
  bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts hypothesis 'Your observation'
  bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts fact 'domain.key' 'value'
  bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts bootstrap
  bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts sweep
  bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts export -o memory.json

Optional: Add alias to shell profile:
  alias pai-memory='bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts'
"
```

### On Failure

```
"Installation encountered issues. Here's what to check:

1. Bun installed? Run: which bun && bun --version
2. Skill files copied? Run: ls $PAI_DIR/skills/MemoryEnhanced/
3. Global deps installed? Run: bun add commander zod -g
4. Hook files created? Run: ls $PAI_DIR/hooks/memory-enhanced-*.ts
5. Run the verification commands in VERIFY.md

Need help? Check the Troubleshooting section below."
```

---

## Quick Reference

### CLI Location
```bash
$PAI_DIR/skills/MemoryEnhanced/cli/cli.ts
```

### Alias (add to shell profile)
```bash
alias pai-memory="bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts"
```

### Storage Location
```
$PAI_DIR/MEMORY/
  hypotheses.jsonl      # Hypothesis tracking
  validated-facts.jsonl # Promoted facts
  cues.json             # Context triggers
  audit.jsonl           # State changes
```

---

## Troubleshooting

### "Cannot find module" errors
Install dependencies globally:
```bash
bun add commander zod -g
```

### Hooks not firing
Check settings.json has correct paths and hooks are executable:
```bash
chmod +x $PAI_DIR/hooks/memory-enhanced-*.ts
cat $PAI_DIR/settings.json | grep memory-enhanced
```

### PAI_DIR not set
Add to shell profile:
```bash
export PAI_DIR="$HOME/.claude"
```

### "Module not found: yaml" or similar
Install global dependency:
```bash
bun add yaml -g
```

---

## Uninstall

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
rm -rf "$PAI_DIR/skills/MemoryEnhanced"
rm "$PAI_DIR/hooks/memory-enhanced-"*.ts
# Manually remove hooks from settings.json
# Optionally remove MEMORY directory (contains your data)
echo "PAI Memory Enhanced uninstalled"
```
