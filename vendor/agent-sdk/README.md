# CodeBuddy Agent SDK

SDK for building AI agents with CodeBuddy Code's capabilities. Programmatically interact with AI to build autonomous agents that can understand codebases, edit files, and execute workflows.

## Installation

```bash
npm install @tencent-ai/agent-sdk
```

## Quick Start

```typescript
import { query } from '@tencent-ai/agent-sdk';

const response = query({
  prompt: 'What files are in this directory?',
  options: {
    permissionMode: 'bypassPermissions',
  },
});

for await (const message of response) {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'text') {
        console.log(block.text);
      }
    }
  }
}
```

## API Reference

### `query(options)`

Create a query to interact with the agent.

```typescript
const q = query({
  prompt: string,           // The prompt to send
  options: {
    model?: string,         // Model to use
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions',
    maxTurns?: number,      // Maximum conversation turns
    cwd?: string,           // Working directory
    hooks?: HookCallback[], // Event hooks
    agents?: Record<string, AgentDefinition>, // Custom agents
  },
});

// Iterate over messages
for await (const message of q) {
  // Handle message
}

```

### Message Types

- `system` - Session initialization info
- `assistant` - Agent responses (text, tool calls)
- `result` - Query completion status

## Related Links

- [CodeBuddy Code CLI](https://www.npmjs.com/package/@tencent-ai/codebuddy-code)
- [Documentation](https://cnb.cool/codebuddy/codebuddy-code/-/blob/main/docs)
- [Issues](https://cnb.cool/codebuddy/codebuddy-code/-/issues)

## Feedback

- Submit issues at [Issues](https://cnb.cool/codebuddy/codebuddy-code/-/issues)
- Contact: codebuddy@tencent.com
