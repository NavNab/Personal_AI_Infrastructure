---
name: Arena
description: Multi-agent orchestration with 1 DIRECTOR + N DOERs. USE WHEN user says arena, multi-agent, director doer, orchestrate agents, collaborative AI, team of agents, spawn multiple agents for a mission. Coordinates specialized AI agents (architect, backend, frontend, qa, security, docs, researcher, refactorer) to accomplish complex tasks.
---

# PAI Arena

Orchestrate multiple AI agents to accomplish complex missions.

---

## MANDATORY: Skill Invocation

When user requests multi-agent orchestration, you MUST:

### Option 1: Start Web UI (Interactive)

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
bun run "$PAI_DIR/skills/Arena/web/server.ts" &
echo "Arena Web UI: http://localhost:3850"
```

Then tell the user to open http://localhost:3850 to configure and run their mission.

### Option 2: Start via CLI (Headless)

```bash
PAI_DIR="${PAI_DIR:-$HOME/.claude}"
bun run "$PAI_DIR/skills/Arena/cli/cli.ts" start \
  --mission "<user's mission>" \
  --doers <comma-separated doers> \
  --budget <turn count>
```

### Choosing DOERs

Based on user's request, select appropriate DOERs:

| Task Type | Recommended DOERs |
|-----------|-------------------|
| Build new feature | architect, backend, frontend |
| API development | architect, backend, qa |
| Full stack app | architect, backend, frontend, qa |
| Security audit | security, researcher |
| Code cleanup | refactorer, qa |
| Documentation | docs, researcher |
| Research task | researcher |

### Example Invocations

User: "Use arena to build me a CLI calculator"
```bash
bun run "$PAI_DIR/skills/Arena/cli/cli.ts" start \
  --mission "Build a CLI calculator with basic arithmetic operations" \
  --doers architect,backend,qa \
  --budget 100
```

User: "I want multiple agents to review my authentication code"
```bash
bun run "$PAI_DIR/skills/Arena/cli/cli.ts" start \
  --mission "Review authentication implementation for security and best practices" \
  --doers security,backend,refactorer \
  --budget 50
```

---

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
