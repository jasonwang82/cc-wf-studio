/**
 * CodeBuddy CLI Service
 *
 * Executes CodeBuddy CLI commands for AI-assisted operations.
 * Follows the pattern established by claude-code-service.ts
 *
 * Updated to use nano-spawn for cross-platform compatibility (Windows/Unix)
 */

import type { ChildProcess } from 'node:child_process';
import nanoSpawn from 'nano-spawn';
import { log } from '../extension';
import { clearCodeBuddyCliPathCache, getCodeBuddySpawnCommand } from './codebuddy-cli-path';

// Re-export for external use
export { clearCodeBuddyCliPathCache };

/**
 * nano-spawn type definitions (manually defined for compatibility)
 */
interface SubprocessError extends Error {
  stdout: string;
  stderr: string;
  output: string;
  command: string;
  durationMs: number;
  exitCode?: number;
  signalName?: string;
  isTerminated?: boolean;
  code?: string;
}

interface Result {
  stdout: string;
  stderr: string;
  output: string;
  command: string;
  durationMs: number;
}

interface Subprocess extends Promise<Result> {
  // nano-spawn v2.0.0: nodeChildProcess is a Promise that resolves to ChildProcess
  // (spawnSubprocess is an async function)
  nodeChildProcess: Promise<ChildProcess>;
  stdout: AsyncIterable<string>;
  stderr: AsyncIterable<string>;
}

const spawn =
  nanoSpawn.default ||
  (nanoSpawn as (
    file: string,
    args?: readonly string[],
    options?: Record<string, unknown>
  ) => Subprocess);

/**
 * Active generation processes
 * Key: requestId, Value: subprocess and start time
 */
const activeProcesses = new Map<string, { subprocess: Subprocess; startTime: number }>();

export interface CodeBuddyExecutionResult {
  success: boolean;
  output?: string;
  error?: {
    code: 'COMMAND_NOT_FOUND' | 'TIMEOUT' | 'PARSE_ERROR' | 'UNKNOWN_ERROR';
    message: string;
    details?: string;
  };
  executionTimeMs: number;
}

/**
 * Execute CodeBuddy CLI with a prompt and return the output
 *
 * @param prompt - The prompt to send to CodeBuddy CLI
 * @param timeoutMs - Timeout in milliseconds (default: 60000)
 * @param requestId - Optional request ID for cancellation support
 * @param workingDirectory - Working directory for CLI execution (defaults to current directory)
 * @returns Execution result with success status and output/error
 */
export async function executeCodeBuddyCLI(
  prompt: string,
  timeoutMs = 60000,
  requestId?: string,
  workingDirectory?: string
): Promise<CodeBuddyExecutionResult> {
  const startTime = Date.now();

  log('INFO', 'Starting CodeBuddy CLI execution', {
    promptLength: prompt.length,
    timeoutMs,
    cwd: workingDirectory ?? process.cwd(),
  });

  try {
    // Build CLI arguments
    const args = ['-p', '-'];

    // Spawn CodeBuddy CLI process using nano-spawn (cross-platform compatible)
    // Use stdin for prompt instead of -p argument to avoid Windows command line length limits
    // Use codebuddy directly if available, otherwise fall back to npx
    const spawnCmd = await getCodeBuddySpawnCommand(args);
    const subprocess = spawn(spawnCmd.command, spawnCmd.args, {
      cwd: workingDirectory,
      timeout: timeoutMs,
      stdin: { string: prompt },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Register as active process if requestId is provided
    if (requestId) {
      activeProcesses.set(requestId, { subprocess, startTime });
      log('INFO', `Registered active process for requestId: ${requestId}`);
    }

    // Wait for subprocess to complete
    const result = await subprocess;

    // Remove from active processes
    if (requestId) {
      activeProcesses.delete(requestId);
      log('INFO', `Removed active process (success) for requestId: ${requestId}`);
    }

    const executionTimeMs = Date.now() - startTime;

    // Success - return stdout
    log('INFO', 'CodeBuddy CLI execution succeeded', {
      executionTimeMs,
      outputLength: result.stdout.length,
    });

    return {
      success: true,
      output: result.stdout.trim(),
      executionTimeMs,
    };
  } catch (error) {
    // Remove from active processes
    if (requestId) {
      activeProcesses.delete(requestId);
      log('INFO', `Removed active process (error) for requestId: ${requestId}`);
    }

    const executionTimeMs = Date.now() - startTime;

    // Log complete error object for debugging
    log('ERROR', 'CodeBuddy CLI error caught', {
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
      errorKeys: error && typeof error === 'object' ? Object.keys(error) : [],
      error: error,
      executionTimeMs,
    });

    // Handle SubprocessError from nano-spawn
    if (isSubprocessError(error)) {
      // Timeout error detection:
      // - nano-spawn may set isTerminated=true and signalName='SIGTERM'
      // - OR it may only set exitCode=143 (128 + 15 = SIGTERM)
      const isTimeout =
        (error.isTerminated && error.signalName === 'SIGTERM') || error.exitCode === 143;

      if (isTimeout) {
        log('WARN', 'CodeBuddy CLI execution timed out', {
          timeoutMs,
          executionTimeMs,
          exitCode: error.exitCode,
          isTerminated: error.isTerminated,
          signalName: error.signalName,
        });

        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: `CodeBuddy execution timed out after ${Math.floor(timeoutMs / 1000)} seconds. Try simplifying your request.`,
            details: `Timeout after ${timeoutMs}ms`,
          },
          executionTimeMs,
        };
      }

      // Command not found (ENOENT)
      if (error.code === 'ENOENT') {
        log('ERROR', 'CodeBuddy CLI not found', {
          errorCode: error.code,
          errorMessage: error.message,
          executionTimeMs,
        });

        return {
          success: false,
          error: {
            code: 'COMMAND_NOT_FOUND',
            message: 'Cannot connect to CodeBuddy - please ensure it is installed and running',
            details: error.message,
          },
          executionTimeMs,
        };
      }

      // Non-zero exit code
      log('ERROR', 'CodeBuddy CLI execution failed', {
        exitCode: error.exitCode,
        executionTimeMs,
        stderr: error.stderr?.substring(0, 200), // Log first 200 chars of stderr
      });

      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Execution failed - please try again or rephrase your request',
          details: `Exit code: ${error.exitCode ?? 'unknown'}, stderr: ${error.stderr ?? 'none'}`,
        },
        executionTimeMs,
      };
    }

    // Unknown error type
    log('ERROR', 'Unexpected error during CodeBuddy CLI execution', {
      errorMessage: error instanceof Error ? error.message : String(error),
      executionTimeMs,
    });

    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred. Please try again.',
        details: error instanceof Error ? error.message : String(error),
      },
      executionTimeMs,
    };
  }
}

/**
 * Type guard to check if an error is a SubprocessError from nano-spawn
 *
 * @param error - The error to check
 * @returns True if error is a SubprocessError
 */
function isSubprocessError(error: unknown): error is SubprocessError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'exitCode' in error &&
    'stderr' in error &&
    'stdout' in error
  );
}

/**
 * Parse JSON output from CodeBuddy CLI
 *
 * Handles multiple output formats:
 * 1. Markdown-wrapped: ```json { ... } ```
 * 2. Raw JSON: { ... }
 *
 * @param output - Raw output string from CLI
 * @returns Parsed JSON object or null if parsing fails
 */
export function parseCodeBuddyOutput(output: string): unknown {
  try {
    const trimmed = output.trim();

    // Strategy 1: If wrapped in ```json...```, remove outer markers only
    if (trimmed.startsWith('```json') && trimmed.endsWith('```')) {
      const jsonContent = trimmed
        .slice(7) // Remove ```json
        .slice(0, -3) // Remove trailing ```
        .trim();
      return JSON.parse(jsonContent);
    }

    // Strategy 2: Try parsing as-is (raw JSON)
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }

    // Strategy 3: Try parsing as-is (fallback)
    return JSON.parse(trimmed);
  } catch (_error) {
    // If parsing fails, return null
    return null;
  }
}

/**
 * Cancel an active generation process
 *
 * @param requestId - Request ID of the generation to cancel
 * @returns True if process was found and killed, false otherwise
 */
export async function cancelCodeBuddyExecution(requestId: string): Promise<{
  cancelled: boolean;
  executionTimeMs?: number;
}> {
  const activeGen = activeProcesses.get(requestId);

  if (!activeGen) {
    log('WARN', `No active CodeBuddy execution found for requestId: ${requestId}`);
    return { cancelled: false };
  }

  const { subprocess, startTime } = activeGen;
  const executionTimeMs = Date.now() - startTime;

  // nano-spawn v2.0.0: nodeChildProcess is a Promise that resolves to ChildProcess
  // We need to await it before calling kill()
  const childProcess = await subprocess.nodeChildProcess;

  log('INFO', `Cancelling CodeBuddy execution for requestId: ${requestId}`, {
    pid: childProcess.pid,
    elapsedMs: executionTimeMs,
  });

  // Kill the process (cross-platform compatible)
  // On Windows: kill() sends an unconditional termination
  // On Unix: kill() sends SIGTERM (graceful termination)
  childProcess.kill();

  // Force kill after 500ms if process doesn't terminate
  setTimeout(() => {
    if (!childProcess.killed) {
      // On Unix: this would be SIGKILL, but kill() without signal works on both platforms
      childProcess.kill();
      log('WARN', `Forcefully killed process for requestId: ${requestId}`);
    }
  }, 500);

  // Remove from active processes map
  activeProcesses.delete(requestId);

  return { cancelled: true, executionTimeMs };
}
