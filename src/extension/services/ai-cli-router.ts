/**
 * AI CLI Router Service
 *
 * Routes AI CLI calls to either Claude Code or CodeBuddy based on user configuration.
 * Provides a unified interface for both backends.
 */

import * as vscode from 'vscode';
import { log } from '../extension';
import { getClaudeSpawnCommand } from './claude-cli-path';
import { getCodeBuddySpawnCommand } from './codebuddy-cli-path';

/**
 * Supported AI backends
 */
export type AIBackend = 'claude-code' | 'codebuddy';

/**
 * Get configured AI backend from VSCode settings
 *
 * @returns Configured backend ('claude-code' or 'codebuddy'), defaults to 'claude-code'
 */
export function getConfiguredBackend(): AIBackend {
  const config = vscode.workspace.getConfiguration('cc-wf-studio');
  const backend = config.get<AIBackend>('ai.backend', 'claude-code');

  // Validate backend value
  if (backend !== 'claude-code' && backend !== 'codebuddy') {
    log('WARN', 'Invalid AI backend configuration, using default', {
      configured: backend,
      default: 'claude-code',
    });
    return 'claude-code';
  }

  return backend;
}

/**
 * Get the backend display name for user-facing messages
 *
 * @param backend - AI backend
 * @returns Human-readable backend name
 */
export function getBackendDisplayName(backend: AIBackend): string {
  switch (backend) {
    case 'claude-code':
      return 'Claude Code';
    case 'codebuddy':
      return 'CodeBuddy';
    default:
      return 'AI Backend';
  }
}

/**
 * Get installation instructions for the specified backend
 *
 * @param backend - AI backend
 * @returns Installation instructions message
 */
export function getBackendInstallationInstructions(backend: AIBackend): string {
  switch (backend) {
    case 'claude-code':
      return 'Install from: https://claude.com/claude-code';
    case 'codebuddy':
      return 'Install with: npm install -g @tencent-ai/codebuddy-code';
    default:
      return 'Check backend configuration';
  }
}

/**
 * Get the command and args for spawning AI CLI based on configured backend
 *
 * @param args - CLI arguments
 * @param backend - Optional backend override (uses configured backend if not specified)
 * @returns command and args for spawn
 */
export async function getAISpawnCommand(
  args: string[],
  backend?: AIBackend
): Promise<{ command: string; args: string[]; backend: AIBackend }> {
  const selectedBackend = backend ?? getConfiguredBackend();

  log('DEBUG', 'Getting AI spawn command', {
    backend: selectedBackend,
    args: args.slice(0, 2), // Log first 2 args for debugging
  });

  switch (selectedBackend) {
    case 'claude-code': {
      const result = await getClaudeSpawnCommand(args);
      return { ...result, backend: 'claude-code' };
    }
    case 'codebuddy': {
      const result = await getCodeBuddySpawnCommand(args);
      return { ...result, backend: 'codebuddy' };
    }
    default:
      log('ERROR', 'Unknown AI backend', { backend: selectedBackend });
      throw new Error(`Unknown AI backend: ${selectedBackend}`);
  }
}

/**
 * Check if AI CLI is available for the configured backend
 *
 * @param backend - Optional backend to check (uses configured backend if not specified)
 * @returns true if CLI is available (installed or via npx), false otherwise
 */
export async function isAICliAvailable(backend?: AIBackend): Promise<boolean> {
  const selectedBackend = backend ?? getConfiguredBackend();

  try {
    // Getting spawn command always succeeds (falls back to npx)
    // So we consider the CLI "available" if we can get a spawn command
    await getAISpawnCommand(['--version'], selectedBackend);
    return true;
  } catch (error) {
    log('ERROR', 'Failed to check AI CLI availability', {
      backend: selectedBackend,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
