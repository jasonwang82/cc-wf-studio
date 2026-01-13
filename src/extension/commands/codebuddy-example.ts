/**
 * CodeBuddy Example Command Handler
 *
 * This is a minimal example demonstrating how to use the CodeBuddy CLI service.
 * You can use this as a reference for integrating CodeBuddy into your own commands.
 *
 * NOTE: This is an example file and is not currently used by the extension.
 * It serves as documentation for developers who want to integrate CodeBuddy.
 */

import type * as vscode from 'vscode';
import { log } from '../extension';
import { executeCodeBuddyCLI, parseCodeBuddyOutput } from '../services/codebuddy-service';

/**
 * Example: Simple text generation with CodeBuddy
 */
export async function exampleSimpleGeneration(
  prompt: string,
  webview: vscode.Webview,
  requestId: string
): Promise<void> {
  log('INFO', 'CodeBuddy generation started', { requestId, promptLength: prompt.length });

  try {
    // Execute CodeBuddy CLI with default timeout (60 seconds)
    const result = await executeCodeBuddyCLI(prompt);

    if (result.success && result.output) {
      log('INFO', 'CodeBuddy generation succeeded', {
        requestId,
        outputLength: result.output.length,
        executionTimeMs: result.executionTimeMs,
      });

      // Send success response to webview
      webview.postMessage({
        type: 'CODEBUDDY_SUCCESS',
        requestId,
        payload: {
          output: result.output,
          executionTimeMs: result.executionTimeMs,
        },
      });
    } else {
      log('ERROR', 'CodeBuddy generation failed', {
        requestId,
        errorCode: result.error?.code,
        errorMessage: result.error?.message,
        executionTimeMs: result.executionTimeMs,
      });

      // Send error response to webview
      webview.postMessage({
        type: 'CODEBUDDY_FAILED',
        requestId,
        payload: {
          error: result.error,
          executionTimeMs: result.executionTimeMs,
        },
      });
    }
  } catch (error) {
    log('ERROR', 'Unexpected error during CodeBuddy generation', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    webview.postMessage({
      type: 'CODEBUDDY_FAILED',
      requestId,
      payload: {
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred',
          details: error instanceof Error ? error.message : String(error),
        },
      },
    });
  }
}

/**
 * Example: JSON response with CodeBuddy
 */
export async function exampleJsonGeneration(
  prompt: string,
  webview: vscode.Webview,
  requestId: string
): Promise<void> {
  log('INFO', 'CodeBuddy JSON generation started', { requestId });

  try {
    // Execute CodeBuddy CLI with custom timeout (30 seconds)
    const result = await executeCodeBuddyCLI(prompt, 30000, requestId);

    if (result.success && result.output) {
      // Parse JSON output
      const parsed = parseCodeBuddyOutput(result.output);

      if (parsed) {
        log('INFO', 'CodeBuddy JSON generation succeeded', {
          requestId,
          executionTimeMs: result.executionTimeMs,
        });

        webview.postMessage({
          type: 'CODEBUDDY_JSON_SUCCESS',
          requestId,
          payload: {
            data: parsed,
            executionTimeMs: result.executionTimeMs,
          },
        });
      } else {
        log('ERROR', 'Failed to parse CodeBuddy JSON output', { requestId });

        webview.postMessage({
          type: 'CODEBUDDY_FAILED',
          requestId,
          payload: {
            error: {
              code: 'PARSE_ERROR',
              message: 'Failed to parse JSON output',
            },
            executionTimeMs: result.executionTimeMs,
          },
        });
      }
    } else {
      log('ERROR', 'CodeBuddy JSON generation failed', {
        requestId,
        errorCode: result.error?.code,
      });

      webview.postMessage({
        type: 'CODEBUDDY_FAILED',
        requestId,
        payload: {
          error: result.error,
          executionTimeMs: result.executionTimeMs,
        },
      });
    }
  } catch (error) {
    log('ERROR', 'Unexpected error during CodeBuddy JSON generation', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    webview.postMessage({
      type: 'CODEBUDDY_FAILED',
      requestId,
      payload: {
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred',
          details: error instanceof Error ? error.message : String(error),
        },
      },
    });
  }
}

/**
 * Example: With custom working directory and timeout
 */
export async function exampleWithOptions(
  prompt: string,
  webview: vscode.Webview,
  requestId: string,
  workspaceRoot?: string
): Promise<void> {
  log('INFO', 'CodeBuddy generation with options started', {
    requestId,
    workspaceRoot,
  });

  try {
    // Execute CodeBuddy CLI with custom settings
    const result = await executeCodeBuddyCLI(
      prompt,
      90000, // 90 second timeout
      requestId,
      workspaceRoot // custom working directory
    );

    if (result.success && result.output) {
      webview.postMessage({
        type: 'CODEBUDDY_SUCCESS',
        requestId,
        payload: {
          output: result.output,
          executionTimeMs: result.executionTimeMs,
        },
      });
    } else {
      webview.postMessage({
        type: 'CODEBUDDY_FAILED',
        requestId,
        payload: {
          error: result.error,
          executionTimeMs: result.executionTimeMs,
        },
      });
    }
  } catch (error) {
    log('ERROR', 'Unexpected error during CodeBuddy generation', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    webview.postMessage({
      type: 'CODEBUDDY_FAILED',
      requestId,
      payload: {
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred',
        },
      },
    });
  }
}

/**
 * Example: With cancellation support
 */
export async function exampleWithCancellation(
  prompt: string,
  webview: vscode.Webview,
  requestId: string,
  cancellationToken?: vscode.CancellationToken
): Promise<void> {
  log('INFO', 'CodeBuddy generation with cancellation started', { requestId });

  try {
    // Start execution
    const executionPromise = executeCodeBuddyCLI(prompt, 60000, requestId);

    // Set up cancellation if token provided
    if (cancellationToken) {
      cancellationToken.onCancellationRequested(async () => {
        log('INFO', 'Cancellation requested for CodeBuddy generation', { requestId });

        // Cancel the active execution
        const { cancelCodeBuddyExecution } = await import('../services/codebuddy-service');
        const cancelResult = await cancelCodeBuddyExecution(requestId);

        if (cancelResult.cancelled) {
          log('INFO', 'CodeBuddy generation cancelled', {
            requestId,
            executionTimeMs: cancelResult.executionTimeMs,
          });

          webview.postMessage({
            type: 'CODEBUDDY_CANCELLED',
            requestId,
            payload: {
              executionTimeMs: cancelResult.executionTimeMs,
            },
          });
        }
      });
    }

    // Wait for execution to complete
    const result = await executionPromise;

    if (result.success && result.output) {
      webview.postMessage({
        type: 'CODEBUDDY_SUCCESS',
        requestId,
        payload: {
          output: result.output,
          executionTimeMs: result.executionTimeMs,
        },
      });
    } else {
      webview.postMessage({
        type: 'CODEBUDDY_FAILED',
        requestId,
        payload: {
          error: result.error,
          executionTimeMs: result.executionTimeMs,
        },
      });
    }
  } catch (error) {
    log('ERROR', 'Unexpected error during CodeBuddy generation', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    webview.postMessage({
      type: 'CODEBUDDY_FAILED',
      requestId,
      payload: {
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred',
        },
      },
    });
  }
}
