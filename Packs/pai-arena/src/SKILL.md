---
name: Arena
version: 1.0.0
description: Multi-agent orchestration with 1 DIRECTOR + N DOERs
---

# PAI Arena

Orchestrate multiple AI agents to accomplish complex missions.

## Philosophy

Complex tasks benefit from specialized perspectives. Rather than one AI trying to do everything, PAI Arena coordinates a team:
- **DIRECTOR** coordinates, assigns tasks, resolves conflicts
- **DOERs** are specialists who execute within their domain

## When to Use

Use PAI Arena when:
- Task requires multiple skill domains (frontend + backend + testing)
- You want different perspectives on a problem
- Task is complex enough to benefit from delegation
- You want to experiment with AI collaboration

## Quick Start

### CLI

```bash
# Start a mission
pai-arena start --mission "Build a todo app" --doers architect,backend,frontend --budget 200

# List sessions
pai-arena sessions

# Resume a session
pai-arena resume <session-id>

# Export transcript
pai-arena export <session-id> -o transcript.md
```

### Web UI

```bash
pai-arena serve
# Open http://localhost:3850
```

## Available DOERs

| DOER | Specialization |
|------|----------------|
| architect | System design, patterns, trade-offs |
| backend | APIs, services, databases |
| frontend | UI/UX, components, styling |
| qa | Testing, edge cases, validation |
| security | Vulnerabilities, hardening, auth |
| docs | Documentation, READMEs, comments |
| researcher | Exploration, information gathering |
| refactorer | Clean code, optimization |

## DIRECTOR Styles

DIRECTOR adapts its style based on mission type:

- **Tech Lead**: For build/implement missions - focuses on quality
- **Project Manager**: For review/audit missions - focuses on progress
- **Socratic**: For research/explore missions - guides through questions
- **Adaptive**: Switches styles based on situation

## Mission Definition

### Simple (default)
```
"Build a REST API for user management with authentication"
```

### Structured (YAML)
```yaml
mission: "E-commerce checkout flow"
phases:
  - name: design
    budget: 100
    doers: [architect]
  - name: build
    budget: 300
    doers: [backend, frontend]
  - name: test
    budget: 100
    doers: [qa, security]
```

## Communication Rules

1. DOERs communicate through DIRECTOR (mesh with routing)
2. DOERs can challenge DIRECTOR decisions
3. DOERs cannot delegate to other DOERs
4. DIRECTOR resolves conflicts (final authority)
5. DIRECTOR allocates turn budget

## Session Persistence

Sessions are saved in `$PAI_DIR/MEMORY/arena/sessions/<id>/`:
- `session.json` - Session metadata
- `transcript.jsonl` - Full message history
- `decision-log.jsonl` - DIRECTOR rulings
- `task-board.json` - Task states
- `budget-report.json` - Turn usage per agent
