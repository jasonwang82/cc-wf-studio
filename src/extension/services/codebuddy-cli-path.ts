/**
 * CodeBuddy CLI Path Detection Service
 *
 * Shared module for detecting CodeBuddy CLI executable path.
 * Handles cases where VSCode Extension Host doesn't have the user's shell PATH settings
 * (e.g., when launched from GUI instead of terminal).
 *
 * Follows the same pattern as claude-cli-path.ts
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
 * Cached CodeBuddy CLI path
 * undefined = not checked yet
 * null = not found (use npx fallback)
 * string = path to codebuddy executable
 */
let cachedCodeBuddyPath: string | null | undefined;

/**
 * Get the path to CodeBuddy CLI executable
 * First checks known installation paths, then falls back to PATH lookup
 *
 * @returns Path to codebuddy executable ('codebuddy' for PATH, full path for known locations, null for npx fallback)
 */
export async function getCodeBuddyCliPath(): Promise<string | null> {
  // Return cached result if available
  if (cachedCodeBuddyPath !== undefined) {
    return cachedCodeBuddyPath;
  }

  // 1. Check known installation paths first (handles GUI-launched VSCode)
  const knownPath = findCodeBuddyCliInKnownPaths();
  if (knownPath) {
    try {
      const result = await spawn(knownPath, ['--version'], { timeout: 5000 });
      log('INFO', 'CodeBuddy CLI found at known path', {
        path: knownPath,
        version: result.stdout.trim().substring(0, 50),
      });
      cachedCodeBuddyPath = knownPath;
      return knownPath;
    } catch (error) {
      // Path exists but execution failed - log and continue to PATH check
      log('WARN', 'CodeBuddy CLI found but not executable at known path', {
        path: knownPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 2. Fall back to PATH lookup (terminal-launched VSCode or other installations)
  try {
    const result = await spawn('codebuddy', ['--version'], { timeout: 5000 });
    log('INFO', 'CodeBuddy CLI found in PATH', {
      version: result.stdout.trim().substring(0, 50),
    });
    cachedCodeBuddyPath = 'codebuddy';
    return 'codebuddy';
  } catch {
    log('INFO', 'CodeBuddy CLI not found, will use npx fallback');
    cachedCodeBuddyPath = null;
    return null;
  }
}

/**
 * Clear CodeBuddy CLI path cache
 * Useful for testing or when user installs CodeBuddy CLI during session
 */
export function clearCodeBuddyCliPathCache(): void {
  cachedCodeBuddyPath = undefined;
}

/**
 * Get the command and args for spawning CodeBuddy CLI
 * Uses codebuddy directly if available (from known paths or PATH), otherwise falls back to 'npx codebuddy'
 *
 * @param args - CLI arguments (without 'codebuddy' command itself)
 * @returns command and args for spawn
 */
export async function getCodeBuddySpawnCommand(
  args: string[]
): Promise<{ command: string; args: string[] }> {
  const codebuddyPath = await getCodeBuddyCliPath();

  if (codebuddyPath) {
    return { command: codebuddyPath, args };
  }
  return { command: 'npx', args: ['codebuddy', ...args] };
}
