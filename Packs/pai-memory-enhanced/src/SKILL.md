---
name: memory-enhanced
description: Record observations, preferences, and learnings to PAI Memory. USE WHEN user states preferences, corrects you, makes decisions, or reveals patterns worth remembering across sessions.
---

# /memory-enhanced - Memory Recording Skill

**Records observations during conversations for cross-session memory.**

## When to Use

Invoke `/memory-enhanced` when you observe something **worth keeping** - information that should persist beyond this session.

## What Defines "Worth Keeping"

### RECORD (High Value)

| Category | Examples | Why It Matters |
|----------|----------|----------------|
| **User Preferences** | "I prefer TypeScript over JavaScript", "Always use dark mode", "Don't add comments to my code" | Shapes future interactions |
| **Corrections** | User corrects your assumption, terminology, or approach | Prevents repeat mistakes |
| **Decisions** | "We're using Bun not Node", "The API is REST not GraphQL" | Project context that persists |
| **Patterns** | User consistently asks for X format, prefers Y approach | Implicit preferences |
| **Domain Knowledge** | "Our API rate limit is 100/min", "Deploy window is 2-4am" | Facts about their environment |
| **Personal Context** | Working hours, communication style, key contacts | Relationship building |

### DON'T RECORD (Low Value)

| Category | Examples | Why Skip It |
|----------|----------|-------------|
| **Temporary Context** | "I'm working on file X", "Current error is Y" | Session-specific, not persistent |
| **Obvious Facts** | "JavaScript is a programming language" | Common knowledge |
| **Speculative** | "User might prefer..." without evidence | No confirmation |
| **Volatile Data** | "Current time is...", "Latest commit is..." | Changes constantly |
| **Implementation Details** | Specific line numbers, temporary file paths | Too granular |

## Usage

```
/memory-enhanced "User prefers functional programming patterns"
/memory-enhanced "Project uses pnpm, not npm"
/memory-enhanced "User's timezone is PST"
```

## Confidence Mechanics

- First observation: hypothesis (confidence ~0.2)
- Repeated observation: confidence increases (+0.2 each)
- 5 observations: promotes to validated fact
- 7 days without validation: hypothesis expires

## Automatic vs Explicit Recording

| Method | When | How |
|--------|------|-----|
| **Explicit** (`/memory-enhanced`) | Claude notices something worth keeping | Invoke this skill |
| **Automatic** (Stop hook) | Session ends | Extracts learnings from conversation |

## Examples in Practice

**User says:** "I hate when code has too many comments"
**Action:** `/memory-enhanced "User prefers minimal code comments"`

**User corrects:** "Actually, we use kebab-case for file names, not camelCase"
**Action:** `/memory-enhanced "Project uses kebab-case file naming convention"`

**Pattern observed:** User has asked for TypeScript 3 times in a row
**Action:** `/memory-enhanced "User defaults to TypeScript for new code"`

**User mentions:** "I'm currently debugging the auth flow"
**Action:** DON'T record - temporary session context

## CLI Commands

```bash
# Add/reinforce hypothesis
bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts hypothesis "observation"

# List hypotheses
bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts hypothesis --list

# Add validated fact directly
bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts fact "domain.key" "value"

# List facts
bun run $PAI_DIR/skills/MemoryEnhanced/cli/cli.ts fact --list
```

Hypotheses that reach high confidence via repeated observation automatically promote to facts.
