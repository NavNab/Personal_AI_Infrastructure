# PAI Arena Architecture

## Overview

PAI Arena is a multi-agent orchestration system that coordinates 1 DIRECTOR and N DOERs to accomplish complex missions.

```
┌─────────────────────────────────────────────────────────────┐
│                         USER                                 │
│                    (Mission Input)                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      DIRECTOR                                │
│              (Adaptive Coordinator)                          │
│                                                              │
│  • Assigns tasks to DOERs                                   │
│  • Routes messages between DOERs                            │
│  • Resolves conflicts                                       │
│  • Tracks progress and budget                               │
└────────────┬─────────────┬─────────────┬────────────────────┘
             │             │             │
      ┌──────┴──────┐     │      ┌──────┴──────┐
      │             │     │      │             │
      ▼             ▼     ▼      ▼             ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ DOER-    │ │ DOER-    │ │ DOER-    │ │ DOER-    │
│ architect│ │ backend  │ │ frontend │ │ qa       │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

## Component Architecture

```
src/
├── core/
│   ├── ClaudeCLI.ts    # Claude CLI process wrapper
│   ├── Director.ts     # DIRECTOR agent logic
│   ├── Doer.ts         # DOER agent base class
│   ├── Router.ts       # Message routing (DIRECTOR-routed mesh)
│   ├── Session.ts      # Session state management
│   └── TaskBoard.ts    # Task lifecycle management
├── storage/
│   └── ArenaStore.ts   # JSONL persistence layer
├── doers/
│   └── *.yaml          # DOER personality definitions
├── cli/
│   ├── cli.ts          # CLI entry point
│   └── commands/       # Individual commands
└── web/
    └── server.ts       # Web UI with SSE streaming
```

## Communication Flow

### DIRECTOR-Routed Mesh

All inter-DOER communication goes through DIRECTOR:

```
DOER-A ──► DIRECTOR ──► DOER-B
           │
           └──► (may add context/modify message)
```

### Message Types

| Type | Description |
|------|-------------|
| task | DIRECTOR assigns work to DOER |
| response | DOER reports results to DIRECTOR |
| question | DOER requests clarification |
| decision | DIRECTOR resolves conflict |
| collaboration | Routed inter-DOER message |

### Event Flow

```
1. User starts mission
2. DIRECTOR analyzes mission, assigns first task
3. DOER executes task, returns result
4. DIRECTOR evaluates, assigns next task or routes to another DOER
5. Repeat until mission complete or budget exhausted
```

## State Management

### Session State

```typescript
interface SessionState {
  session: ArenaSession;      // Session metadata
  agents: Map<string, Agent>; // Agent states
  currentTurn: number;        // Turn counter
  activeAgent: string | null; // Currently executing agent
}
```

### Agent State

```typescript
interface AgentState {
  id: string;
  type: 'director' | 'doer';
  status: 'idle' | 'waiting' | 'active' | 'blocked';
  sessionId: string;          // Claude session ID
  turnsUsed: number;
  turnsAllocated: number;
  currentTask?: string;
}
```

### Task State Machine

```
pending ──► assigned ──► in_progress ──► completed
              │              │
              │              └──► blocked ──► in_progress
              │
              └──► cancelled
```

## Claude CLI Integration

Each agent maintains its own Claude session:

```typescript
async function sendToClaude(message: string, options: ClaudeOptions) {
  const args = options.isFirst
    ? ['-p', message, '--session-id', options.sessionId]
    : ['-p', message, '-r', options.sessionId];

  const result = await $`claude ${args}`.text();
  return cleanResponse(result);
}
```

## DOER Personality System

DOERs are defined in YAML:

```yaml
id: doer-backend
name: DOER-BACKEND
identity: |
  Senior backend engineer with 15 years experience...
expertise:
  - API development
  - Database optimization
style:
  - Pragmatic over perfect
  - Always considers scale
constraints:
  - Never modify frontend code
  - Always suggest tests
```

## Web UI Architecture

### SSE Streaming

```
Client ◄──────── SSE ──────────► Server
         event: message
         event: agent-state
         event: decision
         event: complete
         event: error
```

### Graph Visualization

```
Node States:
  🟢 Active (currently responding)
  🟡 Waiting (has pending task)
  ⚪ Idle (no task assigned)
  🔴 Blocked (needs input)

Edge Types:
  ─── Task assignment
  ··· Question/escalation
  ═══ Routed collaboration
```

## Budget Management

### Allocation Strategy

```
Total Budget (e.g., 1000 turns)
├── DIRECTOR: 20% (200 turns)
└── DOERs: 80% (800 turns)
    ├── DOER-A: 800 / N
    ├── DOER-B: 800 / N
    └── ...
```

### Budget Tracking

```typescript
interface BudgetEntry {
  agentId: string;
  turnsUsed: number;
  turnsAllocated: number;
}
```

## Error Handling

1. **Agent Failure**: Router catches error, broadcasts to UI, DIRECTOR decides next step
2. **Budget Exhausted**: Session completes with "budget exhausted" reason
3. **Conflict**: DOER can challenge, DIRECTOR makes final ruling
4. **CLI Timeout**: Retry with exponential backoff (TODO)

## Extension Points

### Custom DOERs

Create new YAML in `doers/` directory:

```yaml
id: doer-custom
name: DOER-CUSTOM
identity: |
  Your custom specialist...
expertise: [...]
style: [...]
constraints: [...]
```

### Custom DIRECTOR Styles

Extend `determineStyle()` in Director.ts to add new patterns.

### Webhooks (Future)

Planned: Notify external systems on events (completion, errors, decisions).
