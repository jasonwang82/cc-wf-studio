/**
 * Claude CLI Path Detection Service
 *
 * Shared module for detecting Claude CLI executable path.
 * Handles cases where VSCode Extension Host doesn't have the user's shell PATH settings
 * (e.g., when launched from GUI instead of terminal).
 *
 * Supports both 'codebuddy' and 'claude' CLI commands:
 * - Priority: codebuddy > claude > npx claude
 * - CodeBuddy is a complete Claude Code replica with same CLI interface
 *
 * Issue #375: https://github.com/breaking-brake/cc-wf-studio/issues/375
 * PR #376: https://github.com/breaking-brake/cc-wf-studio/pull/376
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import nanoSpawn from 'nano-spawn';
import { log } from '../extension';

interface Result {
  stdout: string;
  stderr: string;
  output: string;
  command: string;
  durationMs: number;
}

const spawn =
  nanoSpawn.default ||
  (nanoSpawn as (
    file: string,
    args?: readonly string[],
    options?: Record<string, unknown>
  ) => Promise<Result>);

/**
 * Known CodeBuddy CLI installation paths
 * These are checked explicitly to handle cases where VSCode Extension Host
 * doesn't have the user's shell PATH settings (e.g., when launched from GUI)
 */
const CODEBUDDY_KNOWN_PATHS = [
  // Native install (macOS/Linux/WSL)
  path.join(os.homedir(), '.local', 'bin', 'codebuddy'),
  // Homebrew (Apple Silicon Mac)
  '/opt/homebrew/bin/codebuddy',
  // Homebrew (Intel Mac) / npm global default
  '/usr/local/bin/codebuddy',
  // npm custom prefix (common configuration)
  path.join(os.homedir(), '.npm-global', 'bin', 'codebuddy'),
];

/**
 * Known Claude CLI installation paths
 * These are checked explicitly to handle cases where VSCode Extension Host
 * doesn't have the user's shell PATH settings (e.g., when launched from GUI)
 */
const CLAUDE_KNOWN_PATHS = [
  // Native install (macOS/Linux/WSL) - curl -fsSL https://claude.ai/install.sh | bash
  path.join(os.homedir(), '.local', 'bin', 'claude'),
  // Homebrew (Apple Silicon Mac)
  '/opt/homebrew/bin/claude',
  // Homebrew (Intel Mac) / npm global default
  '/usr/local/bin/claude',
  // npm custom prefix (common configuration)
  path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
];

/**
 * Find CodeBuddy CLI executable in known installation paths
 *
 * @returns Full path to codebuddy executable if found, null otherwise
 */
function findCodeBuddyCliInKnownPaths(): string | null {
  for (const p of CODEBUDDY_KNOWN_PATHS) {
    if (fs.existsSync(p)) {
      log('DEBUG', 'Found CodeBuddy CLI at known path', { path: p });
      return p;
    }
  }
  return null;
}

/**
 * Find Claude CLI executable in known installation paths
 *
 * @returns Full path to claude executable if found, null otherwise
 */
function findClaudeCliInKnownPaths(): string | null {
  for (const p of CLAUDE_KNOWN_PATHS) {
    if (fs.existsSync(p)) {
      log('DEBUG', 'Found Claude CLI at known path', { path: p });
      return p;
    }
  }
  return null;
}

/**
 * Cached Claude-compatible CLI path (CodeBuddy or Claude)
 * undefined = not checked yet
 * null = not found (use npx fallback)
 * string = path to codebuddy/claude executable
 */
let cachedClaudePath: string | null | undefined;

/**
 * Get the path to Claude-compatible CLI executable (CodeBuddy or Claude)
 * Priority: codebuddy (known paths) > codebuddy (PATH) > claude (known paths) > claude (PATH)
 *
 * @returns Path to codebuddy/claude executable ('codebuddy'/'claude' for PATH, full path for known locations, null for npx fallback)
 */
export async function getClaudeCliPath(): Promise<string | null> {
  // Return cached result if available
  if (cachedClaudePath !== undefined) {
    return cachedClaudePath;
  }

  // 1. Check CodeBuddy known installation paths first (highest priority)
  const codeBuddyKnownPath = findCodeBuddyCliInKnownPaths();
  if (codeBuddyKnownPath) {
    try {
      const result = await spawn(codeBuddyKnownPath, ['--version'], { timeout: 5000 });
      log('INFO', 'CodeBuddy CLI found at known path', {
        path: codeBuddyKnownPath,
        version: result.stdout.trim().substring(0, 50),
      });
      cachedClaudePath = codeBuddyKnownPath;
      return codeBuddyKnownPath;
    } catch (error) {
      // Path exists but execution failed - log and continue
      log('WARN', 'CodeBuddy CLI found but not executable at known path', {
        path: codeBuddyKnownPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 2. Check CodeBuddy in PATH
  try {
    const result = await spawn('codebuddy', ['--version'], { timeout: 5000 });
    log('INFO', 'CodeBuddy CLI found in PATH', {
      version: result.stdout.trim().substring(0, 50),
    });
    cachedClaudePath = 'codebuddy';
    return 'codebuddy';
  } catch {
    log('DEBUG', 'CodeBuddy CLI not found in PATH, checking Claude CLI');
  }

  // 3. Check Claude known installation paths (handles GUI-launched VSCode)
  const knownPath = findClaudeCliInKnownPaths();
  if (knownPath) {
    try {
      const result = await spawn(knownPath, ['--version'], { timeout: 5000 });
      log('INFO', 'Claude CLI found at known path', {
        path: knownPath,
        version: result.stdout.trim().substring(0, 50),
      });
      cachedClaudePath = knownPath;
      return knownPath;
    } catch (error) {
      // Path exists but execution failed - log and continue to PATH check
      log('WARN', 'Claude CLI found but not executable at known path', {
        path: knownPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 4. Fall back to Claude in PATH (terminal-launched VSCode or other installations)
  try {
    const result = await spawn('claude', ['--version'], { timeout: 5000 });
    log('INFO', 'Claude CLI found in PATH', {
      version: result.stdout.trim().substring(0, 50),
    });
    cachedClaudePath = 'claude';
    return 'claude';
  } catch {
    log('INFO', 'No Claude-compatible CLI found (codebuddy or claude), will use npx fallback');
    cachedClaudePath = null;
    return null;
  }
}

/**
 * Clear Claude CLI path cache
 * Useful for testing or when user installs Claude CLI during session
 */
export function clearClaudeCliPathCache(): void {
  cachedClaudePath = undefined;
}

/**
 * Get the command and args for spawning Claude-compatible CLI (CodeBuddy or Claude)
 * Priority: codebuddy > claude > npx claude
 * Uses codebuddy/claude directly if available (from known paths or PATH), otherwise falls back to 'npx claude'
 *
 * @param args - CLI arguments (without 'codebuddy'/'claude' command itself)
 * @returns command and args for spawn
 */
export async function getClaudeSpawnCommand(
  args: string[]
): Promise<{ command: string; args: string[] }> {
  const claudePath = await getClaudeCliPath();

  if (claudePath) {
    return { command: claudePath, args };
  }
  return { command: 'npx', args: ['claude', ...args] };
}
