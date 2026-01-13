---
name: PAI Arena
pack-id: pai-arena-core-v1.0.0
version: 1.0.0
author: nabil
description: Multi-agent orchestration with 1 DIRECTOR + N DOERs
type: skill
purpose-type: [productivity, automation, development]
platform: claude-code
dependencies: []
optional-dependencies: [pai-memory-enhanced]
keywords: [arena, multi-agent, director, doer, orchestration, collaboration]
---

# PAI Arena

> 1 DIRECTOR + N DOERs: Orchestrate multiple AI agents for complex missions

## What It Does

PAI Arena enables multi-agent collaboration where a DIRECTOR coordinates specialized DOER agents to accomplish complex tasks. Each DOER is an expert in their domain (architect, backend, frontend, QA, security, docs, researcher, refactorer).

### Key Features

- **Adaptive DIRECTOR** - Adjusts leadership style based on mission type
- **Specialized DOERs** - 8 pre-built experts with crafted personalities
- **DIRECTOR-routed mesh** - DOERs collaborate through DIRECTOR coordination
- **Shared turn budget** - DIRECTOR allocates turns across agents
- **Graph visualization** - Real-time node graph showing agent activity
- **Session persistence** - Resume missions via PAI Memory
- **CLI + Web interfaces** - Headless automation or interactive UI

### Agent Roster

| Agent | Specialization |
|-------|----------------|
| DIRECTOR | Adaptive coordinator (tech-lead, project-manager, socratic) |
| DOER-architect | System design, patterns, trade-offs |
| DOER-backend | APIs, services, databases |
| DOER-frontend | UI/UX, components, styling |
| DOER-qa | Testing, edge cases, validation |
| DOER-security | Vulnerabilities, hardening, auth |
| DOER-docs | Documentation, comments, READMEs |
| DOER-researcher | Exploration, information gathering |
| DOER-refactorer | Clean code, optimization |

## Installation

Give this directory to your AI and ask it to install using the wizard in `INSTALL.md`.

## Quick Start

```bash
# CLI: Start a mission
pai-arena start --doers architect,backend,qa --mission "Build a REST API"

# CLI: Headless mode
pai-arena run --doers architect,backend --budget 100 --mission "..." --output ./results

# Web UI
pai-arena serve
# Open http://localhost:3850
```

## Mission Definition

Simple prompt:
```
"Build a user authentication system with JWT tokens"
```

Structured YAML:
```yaml
mission: "User authentication system"
phases:
  - name: design
    budget: 100
    doers: [architect]
  - name: build
    budget: 400
    doers: [backend, frontend]
  - name: test
    budget: 200
    doers: [qa, security]
```
