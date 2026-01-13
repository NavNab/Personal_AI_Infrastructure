# Verification Checklist

## Storage

Verify storage at `$PAI_DIR/MEMORY/` (defaults to `~/.claude/MEMORY/`):

- [ ] MEMORY directory exists or is created on first use
- [ ] `hypotheses.jsonl` is writable
- [ ] `validated-facts.jsonl` is writable

## CLI Commands

```bash
# Verify each command works
bun run src/cli/cli.ts --version              # Should show 2.0.0
bun run src/cli/cli.ts fact --list            # Should list (or empty)
bun run src/cli/cli.ts hypothesis --list      # Should list (or empty)
bun run src/cli/cli.ts bootstrap              # Should show context
bun run src/cli/cli.ts cues                   # Should list cues
```

## Core Features

### Fact Creation
```bash
bun run src/cli/cli.ts fact "verify.test" "works" --tags "test"
bun run src/cli/cli.ts fact --query "verify"
# Should show the fact
```

### Hypothesis Lifecycle
```bash
# Create hypothesis
bun run src/cli/cli.ts hypothesis "Test hypothesis" --expiry 1

# Reinforce (run same command to increase observation count)
bun run src/cli/cli.ts hypothesis "Test hypothesis"

# Check confidence increased
bun run src/cli/cli.ts hypothesis --list
```

### Export/Import
```bash
# Export
bun run src/cli/cli.ts export -o /tmp/test-export.json

# Check file exists
cat /tmp/test-export.json

# Import (creates duplicates tagged as imported)
bun run src/cli/cli.ts import /tmp/test-export.json --trust 0.5
```

### Sweep
```bash
bun run src/cli/cli.ts sweep
# Should show: Checked, Expired, Promoted counts
```

## Environment Variables

```bash
# Verify env var reading
export PAI_MODEL_ID="test-model"
bun run src/cli/cli.ts export --stdout | grep "sourceModel"
# Should show "test-model"
```

## All Checks Passed?

If all checks pass, the installation is verified. Run:

```bash
echo "✓ PAI Memory Enhanced verified successfully"
```
