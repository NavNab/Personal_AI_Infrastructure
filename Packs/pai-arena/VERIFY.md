# PAI Arena Verification Checklist

Run these checks to verify PAI Arena is installed correctly.

## Prerequisites

- [ ] Bun installed: `bun --version`
- [ ] Claude CLI installed: `claude --version`
- [ ] PAI_DIR set: `echo $PAI_DIR` (defaults to ~/.claude)

## Directory Structure

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
```

- [ ] Arena skill exists: `ls "$PAI_DIR/skills/Arena/"`
- [ ] CLI exists: `ls "$PAI_DIR/skills/Arena/cli/cli.ts"`
- [ ] DOERs exist: `ls "$PAI_DIR/skills/Arena/doers/"`
- [ ] Session storage exists: `ls "$PAI_DIR/MEMORY/arena/sessions/"`

## CLI Commands

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
ARENA_CLI="bun run $PAI_DIR/skills/Arena/cli/cli.ts"
```

- [ ] Help works: `$ARENA_CLI --help`
- [ ] Start command: `$ARENA_CLI start --help`
- [ ] Sessions command: `$ARENA_CLI sessions`

## Create Test Session

```bash
$ARENA_CLI start --mission "Test installation" --doers architect --budget 10
```

- [ ] Session created successfully
- [ ] Session appears in `$ARENA_CLI sessions`

## Web UI

```bash
bun run "$PAI_DIR/skills/Arena/web/server.ts" &
sleep 2
curl -s http://localhost:3850/ | grep -q "PAI Arena" && echo "✓ Web UI serving"
kill %1 2>/dev/null
```

- [ ] Server starts on port 3850
- [ ] HTML page loads correctly

## DOER Definitions

- [ ] architect.yaml exists and is valid YAML
- [ ] backend.yaml exists and is valid YAML
- [ ] All 8 DOERs present: architect, backend, frontend, qa, security, docs, researcher, refactorer

## All Checks Passed?

If yes, run:
```bash
echo "✓ PAI Arena verified successfully"
```

## Quick Smoke Test

Run a minimal mission to verify end-to-end:

```bash
$ARENA_CLI start --mission "Say hello" --doers researcher --budget 5
```

Expected: Session created, DIRECTOR initialized, DOER ready.
