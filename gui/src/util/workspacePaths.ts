/**
 * Utility functions for workspace paths handling
 */

declare global {
  interface Window {
    workspacePaths?: string[];
  }
}

/**
 * Wait for window.workspacePaths to be set by IDE initialization.
 * Uses polling with timeout to ensure reliable detection.
 *
 * @param timeout Maximum time to wait in milliseconds (default: 5000ms)
 * @param interval Polling interval in milliseconds (default: 100ms)
 * @returns Promise that resolves to workspace paths array
 */
export function waitForWorkspacePaths(
  timeout: number = 5000,
  interval: number = 100,
): Promise<string[]> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const check = () => {
      const paths = window.workspacePaths;
      if (paths && Array.isArray(paths) && paths.length > 0) {
        console.log(
          "[waitForWorkspacePaths] Paths detected:",
          paths.length,
          "paths",
        );
        resolve(paths);
        return;
      }

      if (Date.now() - startTime > timeout) {
        // Timeout: resolve with empty array (will start new session)
        console.warn(
          "[waitForWorkspacePaths] Timeout after",
          timeout,
          "ms, proceeding with empty paths",
        );
        resolve([]);
        return;
      }

      setTimeout(check, interval);
    };

    check();
  });
}

/**
 * Check if workspace paths are already available
 */
export function hasWorkspacePaths(): boolean {
  const paths = window.workspacePaths;
  return !!(paths && Array.isArray(paths) && paths.length > 0);
}
