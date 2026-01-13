# CodeBuddy Integration

## Overview

cc-wf-studio now supports integrating with CodeBuddy CLI, similar to Claude Code CLI. This allows you to execute CodeBuddy commands directly from the extension for AI-assisted operations.

## Prerequisites

### Installing CodeBuddy CLI

You need to have CodeBuddy CLI installed on your system. You can install it via:

- **Native install**: Follow CodeBuddy's official installation guide
- **npm global**: `npm install -g codebuddy`
- **Homebrew** (macOS): If available through Homebrew

### Supported Installation Paths

The extension automatically detects CodeBuddy CLI in these locations:

1. `~/.local/bin/codebuddy` (Native install for macOS/Linux/WSL)
2. `/opt/homebrew/bin/codebuddy` (Homebrew on Apple Silicon Mac)
3. `/usr/local/bin/codebuddy` (Homebrew on Intel Mac / npm global default)
4. `~/.npm-global/bin/codebuddy` (npm custom prefix)
5. System PATH (terminal-launched VSCode)
6. **Fallback**: `npx codebuddy` (if CodeBuddy is not found in known paths)

## Architecture

### Core Services

#### `codebuddy-cli-path.ts`

Handles CLI path detection with the following features:

- **Caching**: Caches the detected CLI path to avoid repeated filesystem checks
- **Known Path Detection**: Checks common installation directories first
- **PATH Fallback**: Falls back to system PATH if not found in known locations
- **npx Fallback**: Uses `npx codebuddy` as last resort
- **Cache Clearing**: Provides `clearCodeBuddyCliPathCache()` for testing or when CLI is installed during session

```typescript
import { getCodeBuddyCliPath, getCodeBuddySpawnCommand } from './codebuddy-cli-path';

// Get CLI path
const path = await getCodeBuddyCliPath();
// Returns: string (CLI path) | null (use npx)

// Get spawn command
const { command, args } = await getCodeBuddySpawnCommand(['-p', '-']);
// Returns: { command: 'codebuddy', args: ['-p', '-'] }
// or: { command: 'npx', args: ['codebuddy', '-p', '-'] }
```

#### `codebuddy-service.ts`

Handles CLI execution with the following features:

- **Cross-platform Support**: Uses nano-spawn for Windows/Unix compatibility
- **Timeout Handling**: Configurable timeout (default: 60 seconds)
- **Process Management**: Active process tracking for cancellation support
- **Error Handling**: Structured error codes (COMMAND_NOT_FOUND, TIMEOUT, UNKNOWN_ERROR)
- **Logging**: Comprehensive logging to "Claude Code Workflow Studio" Output Channel

```typescript
import { executeCodeBuddyCLI } from './codebuddy-service';

// Execute CodeBuddy CLI
const result = await executeCodeBuddyCLI(
  'Your prompt here',
  60000, // timeout in ms
  'request-id', // optional request ID for cancellation
  '/path/to/working/dir' // optional working directory
);

if (result.success) {
  console.log(result.output);
} else {
  console.error(result.error);
}
```

## Usage Examples

### Basic Execution

```typescript
import { executeCodeBuddyCLI } from '../services/codebuddy-service';

async function generateCode(prompt: string) {
  const result = await executeCodeBuddyCLI(prompt);
  
  if (result.success) {
    return result.output;
  } else {
    throw new Error(result.error?.message || 'Execution failed');
  }
}
```

### With Cancellation Support

```typescript
import {
  executeCodeBuddyCLI,
  cancelCodeBuddyExecution,
} from '../services/codebuddy-service';

const requestId = 'unique-request-id';

// Start execution
const executionPromise = executeCodeBuddyCLI(
  'Your prompt',
  60000,
  requestId
);

// Cancel if needed
setTimeout(async () => {
  const cancelResult = await cancelCodeBuddyExecution(requestId);
  if (cancelResult.cancelled) {
    console.log('Execution cancelled');
  }
}, 5000);

// Wait for result
const result = await executionPromise;
```

### Parsing JSON Output

```typescript
import {
  executeCodeBuddyCLI,
  parseCodeBuddyOutput,
} from '../services/codebuddy-service';

async function getStructuredData(prompt: string) {
  const result = await executeCodeBuddyCLI(prompt);
  
  if (result.success) {
    const parsed = parseCodeBuddyOutput(result.output);
    
    if (parsed) {
      return parsed;
    } else {
      throw new Error('Failed to parse JSON output');
    }
  }
  
  throw new Error(result.error?.message || 'Execution failed');
}
```

## Error Handling

### Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `COMMAND_NOT_FOUND` | CodeBuddy CLI not found | Install CodeBuddy CLI |
| `TIMEOUT` | Execution timed out | Increase timeout or simplify prompt |
| `PARSE_ERROR` | Failed to parse output | Check output format |
| `UNKNOWN_ERROR` | Unexpected error | Check logs in Output Channel |

### Error Response Structure

```typescript
interface CodeBuddyExecutionResult {
  success: boolean;
  output?: string;
  error?: {
    code: 'COMMAND_NOT_FOUND' | 'TIMEOUT' | 'PARSE_ERROR' | 'UNKNOWN_ERROR';
    message: string;
    details?: string;
  };
  executionTimeMs: number;
}
```

## Debugging

### Viewing Logs

1. Open VSCode Command Palette (Cmd/Ctrl + Shift + P)
2. Run "Developer: Show Logs"
3. Select "Extension Host"
4. Filter by "Claude Code Workflow Studio"

### Log Levels

- **INFO**: Normal execution flow
- **WARN**: Recoverable issues (e.g., CLI not found, using npx)
- **ERROR**: Execution failures
- **DEBUG**: Detailed execution information

### Common Issues

#### CLI Not Found

```
ERROR: CodeBuddy CLI not found
Solution: Install CodeBuddy CLI or ensure it's in PATH
```

#### Timeout

```
WARN: CodeBuddy CLI execution timed out
Solution: Increase timeout or simplify prompt
```

## Testing

### Manual Testing

```bash
# Test CLI detection
codebuddy --version

# Test execution
codebuddy -p "Hello, CodeBuddy!"

# Test help
codebuddy --help
```

### Integration Testing

```typescript
import {
  getCodeBuddyCliPath,
  clearCodeBuddyCliPathCache,
} from '../services/codebuddy-cli-path';

// Clear cache before testing
clearCodeBuddyCliPathCache();

// Test path detection
const path = await getCodeBuddyCliPath();
console.log('CodeBuddy CLI path:', path);

// Test execution
const result = await executeCodeBuddyCLI('test prompt');
console.log('Execution result:', result);
```

## Differences from Claude Code Integration

CodeBuddy integration follows the same pattern as Claude Code but with simplified features:

1. **No Model Selection**: CodeBuddy uses default model
2. **No Streaming Support**: Only standard execution (no real-time output)
3. **No Tool Restriction**: No `--tools` or `--allowed-tools` flags
4. **Simpler Output Parsing**: Supports JSON-wrapped and raw JSON only

## Future Enhancements

Potential future improvements:

1. **Streaming Support**: Add real-time output streaming
2. **Model Selection**: Support different CodeBuddy models
3. **Tool Restriction**: Add tool whitelisting support
4. **Session Continuation**: Support for multi-turn conversations
5. **Advanced Error Recovery**: Automatic retry with exponential backoff

## Contributing

When adding CodeBuddy-related features:

1. Follow existing Claude Code patterns
2. Add comprehensive error handling
3. Include logging for debugging
4. Update this documentation
5. Test cross-platform compatibility (Windows, macOS, Linux)

## See Also

- [Claude Code Integration](../src/extension/services/claude-code-service.ts)
- [CLI Path Detection](../src/extension/services/claude-cli-path.ts)
- [MCP Integration](../specs/001-mcp-node/spec.md)
