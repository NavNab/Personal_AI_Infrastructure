# PAI Arena Installation Wizard

This is an AI-assisted installation guide. Give this file to Claude and it will install PAI Arena for you.

## Prerequisites

- Bun runtime installed
- Claude Code CLI installed
- PAI_DIR environment variable set (defaults to ~/.claude)

---

## Phase 1: System Analysis

### Step 1.1: Check Prerequisites

```bash
# Check Bun
which bun && bun --version || echo "Bun NOT installed - install from https://bun.sh"

# Check Claude CLI
which claude && claude --version || echo "Claude CLI NOT installed"

# Check PAI_DIR
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
echo "PAI_DIR: $PAI_DIR"
```

### Step 1.2: Detect Installation State

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"

if [ -d "$PAI_DIR/skills/Arena" ]; then
  echo "UPGRADE: Existing Arena installation found"
  # Backup existing
  BACKUP_DIR="$PAI_DIR/backups/arena-$(date +%Y%m%d%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  cp -r "$PAI_DIR/skills/Arena" "$BACKUP_DIR/"
  echo "Backup created: $BACKUP_DIR"
else
  echo "FRESH: No existing installation"
fi
```

**STOP** if Bun or Claude CLI are not installed. User must install them first.

---

## Phase 2: Installation

Use TodoWrite to track progress through these steps.

### Step 2.1: Create Directory Structure

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"

mkdir -p "$PAI_DIR/skills/Arena/cli/commands"
mkdir -p "$PAI_DIR/skills/Arena/core"
mkdir -p "$PAI_DIR/skills/Arena/doers"
mkdir -p "$PAI_DIR/skills/Arena/storage"
mkdir -p "$PAI_DIR/skills/Arena/web"
mkdir -p "$PAI_DIR/MEMORY/arena/sessions"

echo "✓ Directory structure created"
```

### Step 2.2: Copy Source Files

Copy all files from `src/` to `$PAI_DIR/skills/Arena/`:

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
PACK_DIR="$(dirname "$(realpath "$0")")"

# Copy core modules
cp "$PACK_DIR/src/core/"*.ts "$PAI_DIR/skills/Arena/core/"
cp "$PACK_DIR/src/storage/"*.ts "$PAI_DIR/skills/Arena/storage/"
cp "$PACK_DIR/src/cli/cli.ts" "$PAI_DIR/skills/Arena/cli/"
cp "$PACK_DIR/src/cli/commands/"*.ts "$PAI_DIR/skills/Arena/cli/commands/"
cp "$PACK_DIR/src/doers/"*.yaml "$PAI_DIR/skills/Arena/doers/"
cp "$PACK_DIR/src/web/server.ts" "$PAI_DIR/skills/Arena/web/"
cp "$PACK_DIR/src/index.ts" "$PAI_DIR/skills/Arena/"
cp "$PACK_DIR/src/SKILL.md" "$PAI_DIR/skills/Arena/" 2>/dev/null || true

echo "✓ Source files copied"
```

### Step 2.3: Create CLI Wrapper

Create the global `pai-arena` command:

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"

cat > "$PAI_DIR/bin/pai-arena" << 'EOF'
#!/usr/bin/env bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
exec bun run "$PAI_DIR/skills/Arena/cli/cli.ts" "$@"
EOF

chmod +x "$PAI_DIR/bin/pai-arena"
echo "✓ CLI wrapper created at $PAI_DIR/bin/pai-arena"
```

### Step 2.4: Install Dependencies

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
cd "$PAI_DIR"

# Add Arena dependencies to global PAI package.json
# These are added alongside other PAI dependencies
bun add commander@^12.0.0 yaml@^2.3.0

echo "✓ Dependencies installed in $PAI_DIR/package.json"
```

---

## Phase 3: Verification

### Step 3.1: Test CLI

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"

# Test help
bun run "$PAI_DIR/skills/Arena/cli/cli.ts" --help

# Test start (dry run)
bun run "$PAI_DIR/skills/Arena/cli/cli.ts" sessions
```

### Step 3.2: Test Web UI

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"

# Start server in background
bun run "$PAI_DIR/skills/Arena/web/server.ts" &
SERVER_PID=$!
sleep 2

# Test endpoint
curl -s http://localhost:3850/ | head -5

# Stop server
kill $SERVER_PID 2>/dev/null

echo "✓ Web UI operational"
```

### Step 3.3: Verify Storage

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"

# Check session storage directory
ls -la "$PAI_DIR/MEMORY/arena/sessions/"
echo "✓ Storage directory ready"
```

---

## Installation Complete

If all checks pass, PAI Arena is ready to use:

```bash
# CLI usage
pai-arena start --mission "Build a REST API" --doers architect,backend

# Web UI
pai-arena serve
# Open http://localhost:3850
```

---

## Troubleshooting

### "command not found: bun"
Install Bun: `curl -fsSL https://bun.sh/install | bash`

### "command not found: claude"
Install Claude Code CLI from Anthropic

### Permission denied
Run: `chmod +x $PAI_DIR/bin/pai-arena`

### Port 3850 in use
Set custom port: `ARENA_PORT=3851 pai-arena serve`
