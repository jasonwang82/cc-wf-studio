# CodeBuddy Integration Guide

This document provides technical details about the CodeBuddy integration in Claude Code Workflow Studio.

## Overview

CodeBuddy is Tencent's AI coding assistant, similar to Anthropic's Claude Code. Starting from version 3.15.0, this extension supports both Claude Code and CodeBuddy as interchangeable AI backends.

## Architecture

### Backend Selection

The extension uses a configuration-based backend selection mechanism:

- **Configuration Key**: `cc-wf-studio.ai.backend`
- **Default Value**: `"claude-code"`
- **Allowed Values**: `"claude-code"` | `"codebuddy"`

### Core Components

#### 1. AI CLI Router (`src/extension/services/ai-cli-router.ts`)

Central routing service that abstracts backend differences:

```typescript
// Get configured backend
const backend = getConfiguredBackend(); // Returns 'claude-code' or 'codebuddy'

// Get spawn command for current backend
const { command, args, backend } = await getAISpawnCommand(['--version']);

// Get backend-specific error messages
const displayName = getBackendDisplayName(backend); // "Claude Code" or "CodeBuddy"
const instructions = getBackendInstallationInstructions(backend);
```

#### 2. CodeBuddy CLI Path Detection (`src/extension/services/codebuddy-cli-path.ts`)

Detects CodeBuddy CLI installation:

- Checks known paths: `~/.local/bin/codebuddy`, `/opt/homebrew/bin/cbc`, etc.
- Falls back to PATH lookup: `cbc` or `codebuddy` command
- Final fallback: `npx @tencent-ai/codebuddy-code`

#### 3. Claude Code Service (`src/extension/services/claude-code-service.ts`)

Refactored to use AI router:

- `executeClaudeCodeCLI()` - Non-streaming execution
- `executeClaudeCodeCLIStreaming()` - Streaming execution with progress callbacks
- Both functions now backend-agnostic, routing through `getAISpawnCommand()`

### CLI Command Compatibility

Both backends support the same CLI interface:

```bash
# Common commands
<cli-command> -p - --model sonnet          # Prompt from stdin
<cli-command> --version                    # Version check
<cli-command> --output-format stream-json  # Streaming output
<cli-command> --tools Read,Grep,Bash       # Tool restrictions
<cli-command> --resume <session-id>        # Session continuation
```

Where `<cli-command>` is:
- `claude` (or `npx claude`) for Claude Code
- `cbc` or `codebuddy` (or `npx @tencent-ai/codebuddy-code`) for CodeBuddy

## Installation

### Claude Code (Default)

```bash
# Official installer (recommended)
curl -fsSL https://claude.ai/install.sh | bash

# Or via npm
npm install -g claude

# Verify
claude --version
```

### CodeBuddy

```bash
# Install from npm
npm install -g @tencent-ai/codebuddy-code

# Verify
cbc --version
# or
codebuddy --version
```

## Configuration

Users can switch backends via VSCode settings:

1. Open Settings: `Ctrl+,` (Windows/Linux) or `Cmd+,` (Mac)
2. Search: "Claude Code Workflow Studio"
3. Find: "AI Backend"
4. Select: "claude-code" (default) or "codebuddy"

Or edit `settings.json`:

```json
{
  "cc-wf-studio.ai.backend": "codebuddy"
}
```

## Error Handling

The extension provides backend-aware error messages:

### COMMAND_NOT_FOUND Error

**Claude Code:**
```
Cannot connect to Claude Code - please ensure it is installed and running
Install from: https://claude.com/claude-code
```

**CodeBuddy:**
```
Cannot connect to CodeBuddy - please ensure it is installed and running
Install with: npm install -g @tencent-ai/codebuddy-code
```

### Timeout Errors

Backend-agnostic message:
```
AI generation timed out after 90 seconds. Try simplifying your description.
```

## Testing

### Manual Testing Checklist

- [ ] Install CodeBuddy: `npm install -g @tencent-ai/codebuddy-code`
- [ ] Verify installation: `cbc --version`
- [ ] Switch backend to CodeBuddy in VSCode settings
- [ ] Test workflow generation ("Generate with AI")
- [ ] Test workflow refinement ("Edit with AI")
- [ ] Test error handling (uninstall CLI temporarily)
- [ ] Switch back to Claude Code
- [ ] Verify Claude Code still works

### Expected Behavior

1. **With Claude Code installed:**
   - Default backend works immediately
   - Workflow generation and refinement use Claude Code

2. **With CodeBuddy installed:**
   - Change setting to "codebuddy"
   - Workflow generation and refinement use CodeBuddy
   - UI shows CodeBuddy in error messages

3. **With neither installed:**
   - System falls back to `npx` (downloads on-demand)
   - First execution may be slow due to download

## Known Differences

While both backends share the same CLI interface, there may be subtle differences:

1. **Model Names**: Both support `sonnet`, `opus`, `haiku` (mapped to backend-specific models)
2. **Tool Support**: Both support tool restrictions (`--tools` flag)
3. **Streaming**: Both support `--output-format stream-json`
4. **Session Continuation**: Both support `--resume` for context preservation

If you encounter compatibility issues, please report them on GitHub.

## Future Enhancements

Potential improvements for future versions:

1. **Auto-detection**: Automatically detect and switch to available backend
2. **Backend indicator**: Show current backend in status bar
3. **Runtime switching**: Switch backends without reloading VSCode
4. **Per-workspace settings**: Allow different backends for different projects
5. **Backend comparison**: Side-by-side execution with both backends

## References

- **Claude Code**: https://claude.com/claude-code
- **CodeBuddy**: https://cnb.cool/codebuddy/codebuddy-code
- **npm package**: https://www.npmjs.com/package/@tencent-ai/codebuddy-code

---

**Last Updated**: 2026-01-13
**Version**: 3.15.0
