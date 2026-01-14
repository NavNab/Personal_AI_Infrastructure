# MultiLLM Integration for Arena Think Tank

## Overview

The MultiLLM Bridge provides cognitive diversity for Arena's DIRECTOR by consulting multiple LLM providers for strategic decisions. This enables the DIRECTOR to gather diverse perspectives before assigning tasks to DOERs.

## Critical Constraint: TEXT-ONLY

**All MultiLLM queries are TEXT-ONLY. No tools, no MCPs, no permission prompts.**

Arena runs in dangerous mode (fully autonomous). If MultiLLM queries trigger permission prompts, it breaks the entire flow.

```
ARENA Mission Running
        |
        v
DIRECTOR hits strategic decision
"JWT vs Sessions? Which library?"
        |
        v
+-------------------------------------+
| MultiLLMBridge (TEXT-ONLY)          |
|                                     |
| -> Claude: "JWT for stateless..."   |
| -> Gemini: "Consider refresh..."    |
| -> Codex: "Use proven library..."   |
|                                     |
| -> Synthesis returned to DIRECTOR   |
+-------------------------------------+
        |
        v
DIRECTOR decides, DOERs execute
(Claude dangerous mode, uninterrupted)
```

## Usage

### Basic Think Tank Query

```typescript
import { createThinkTank } from './integrations/MultiLLMBridge';

const thinkTank = createThinkTank();

// Single strategic question
const result = await thinkTank.think(
  "Should we use JWT tokens or session-based auth for this API?"
);

console.log(result.perspectives);
// [{provider: 'claude', response: '...', success: true}, ...]

console.log(result.synthesis);
// "## Think Tank Synthesis..."
```

### Multi-Provider Debate

```typescript
// Complex decisions benefit from multi-round debate
const debate = await thinkTank.debate(
  "Microservices vs Monolith for this e-commerce platform?",
  2 // 2 rounds
);

console.log(debate.conclusion);
// Final synthesized conclusion
```

### Check MultiLLM Availability

```typescript
import { detectMultiLLM } from './integrations/MultiLLMBridge';

const status = detectMultiLLM();
if (status.available) {
  console.log('Providers:', status.providers);
} else {
  console.log('Falling back to Claude-only:', status.error);
}
```

## API Reference

### `MultiLLMBridge`

Main class for Think Tank operations.

#### Constructor Options

```typescript
interface ThinkTankConfig {
  timeout: number;           // Max wait per provider (default: 30000ms)
  parallel: boolean;         // Query providers in parallel (default: true)
  preferredProviders: string[]; // Preferred order (default: ['claude', 'gemini', 'codex'])
  claudeFallback: boolean;   // Fallback to Claude if MultiLLM unavailable (default: true)
}
```

#### Methods

##### `think(question: string, providers?: string[]): Promise<ThinkResult>`

Query multiple providers for perspectives on a question.

```typescript
interface ThinkResult {
  question: string;
  perspectives: ProviderPerspective[];
  synthesis?: string;
  totalDurationMs: number;
  providersQueried: number;
  providersResponded: number;
}
```

##### `debate(topic: string, rounds?: number, providers?: string[]): Promise<DebateResult>`

Multi-round debate where providers respond to each other.

```typescript
interface DebateResult {
  topic: string;
  rounds: Array<{
    round: number;
    perspectives: ProviderPerspective[];
  }>;
  synthesis: string;
  conclusion: string;
  totalDurationMs: number;
}
```

##### `getStatus(): MultiLLMStatus`

Get current MultiLLM availability status.

##### `isAvailable(): boolean`

Check if MultiLLM is configured and available.

##### `getProviders(): string[]`

Get list of available provider names.

## Integration with DIRECTOR

The DIRECTOR should use the Think Tank for:

1. **Architecture Decisions**: "Microservices vs Monolith?"
2. **Technology Choices**: "Which database for this use case?"
3. **Security Approaches**: "JWT vs Sessions?"
4. **Design Patterns**: "Which pattern best fits this problem?"

Example integration in Director:

```typescript
class Director {
  private thinkTank: MultiLLMBridge;

  constructor() {
    this.thinkTank = createThinkTank();
  }

  async makeStrategicDecision(question: string): Promise<string> {
    const result = await this.thinkTank.think(question);

    if (result.providersResponded > 1) {
      return result.synthesis!;
    }

    return result.perspectives[0]?.response || 'Unable to reach consensus';
  }
}
```

## Graceful Fallback

If the MultiLLM pack is not installed or configured, the bridge automatically falls back to Claude-only queries:

```typescript
const thinkTank = createThinkTank({ claudeFallback: true });

// Even without MultiLLM pack, this works
const result = await thinkTank.think("Should we use TypeScript?");
// result.perspectives will contain only Claude's response
```

To disable fallback and require MultiLLM:

```typescript
const thinkTank = createThinkTank({ claudeFallback: false });

if (!thinkTank.isAvailable()) {
  throw new Error('MultiLLM required but not available');
}
```

## Configuration

### Environment Variables

- `PAI_DIR` - Personal AI directory (default: `~/.claude`)

### team.yaml Location

The bridge looks for the MultiLLM team configuration at:
```
$PAI_DIR/config/team.yaml
```

## Text-Only Enforcement

The bridge enforces text-only queries by:

1. **No --tools flag** - Commands never include tool access
2. **No MCPs** - No MCP servers are invoked
3. **Simple stdin/stdout** - Just prompt in, text out
4. **No interactive features** - No features requiring user input

Provider commands used:

| Provider | Command |
|----------|---------|
| Claude | `claude -p 'prompt' --output-format text` |
| Gemini | `gemini -p 'prompt'` |
| Codex | `codex -p 'prompt'` |
| Ollama | `ollama run llama3 'prompt'` |
| OpenCode | `opencode chat 'prompt'` |

## Performance Considerations

- **Parallel queries** (default) are faster but use more resources
- **Sequential queries** are safer for rate-limited providers
- **Timeout** prevents hung queries from blocking Arena

```typescript
// For rate-limited scenarios
const thinkTank = createThinkTank({
  parallel: false,
  timeout: 60000
});
```

## Troubleshooting

### "team.yaml not found"

The MultiLLM pack is not configured. Either:
1. Install and configure pai-multi-llm
2. Rely on Claude fallback (enabled by default)

### Provider timeouts

Increase the timeout:
```typescript
const thinkTank = createThinkTank({ timeout: 60000 });
```

### Empty responses

Some providers may return empty responses. The bridge handles this gracefully and marks them as failed.

## Future Enhancements

- Custom prompt templates per provider
- Response caching for similar questions
- Provider-specific timeout settings
- Weighted synthesis based on provider strengths
