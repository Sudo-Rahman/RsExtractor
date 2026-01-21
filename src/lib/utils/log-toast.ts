/**
 * Unified helper for logging + toast notifications
 * Combines logStore entries with svelte-sonner toasts that include "View Log" action
 */

import { toast } from 'svelte-sonner';
import { logStore, type LogLevel, type LogSource, type LogContext } from '$lib/stores/logs.svelte';

interface LogToastOptions {
  source: LogSource;
  title: string;
  details: string;
  context?: LogContext;
}

interface LogToastWithActionOptions extends LogToastOptions {
  showToast?: boolean;  // Default true
  showAction?: boolean; // Show "View Log" button - default true for errors/warnings
}

/**
 * Helper object for combined logging + toast
 * Each method logs to the store and shows a toast with optional "View Log" button
 */
export const logAndToast = {
  /**
   * Log an error and show error toast with "View Log" button
   */
  error(options: LogToastWithActionOptions) {
    const { source, title, details, context, showToast = true, showAction = true } = options;
    
    const logId = logStore.addLog({
      level: 'error',
      source,
      title,
      details,
      context
    });

    if (showToast) {
      if (showAction) {
        toast.error(title, {
          action: {
            label: 'View Log',
            onClick: () => {
              logStore.selectLog(logId);
              logStore.open();
            }
          }
        });
      } else {
        toast.error(title);
      }
    }

    return logId;
  },

  /**
   * Log a warning and show warning toast with optional "View Log" button
   */
  warning(options: LogToastWithActionOptions) {
    const { source, title, details, context, showToast = true, showAction = true } = options;
    
    const logId = logStore.addLog({
      level: 'warning',
      source,
      title,
      details,
      context
    });

    if (showToast) {
      if (showAction) {
        toast.warning(title, {
          action: {
            label: 'View Log',
            onClick: () => {
              logStore.selectLog(logId);
              logStore.open();
            }
          }
        });
      } else {
        toast.warning(title);
      }
    }

    return logId;
  },

  /**
   * Log a success and show success toast (no "View Log" by default)
   */
  success(options: LogToastWithActionOptions) {
    const { source, title, details, context, showToast = true, showAction = false } = options;
    
    const logId = logStore.addLog({
      level: 'success',
      source,
      title,
      details,
      context
    });

    if (showToast) {
      if (showAction) {
        toast.success(title, {
          action: {
            label: 'View Log',
            onClick: () => {
              logStore.selectLog(logId);
              logStore.open();
            }
          }
        });
      } else {
        toast.success(title);
      }
    }

    return logId;
  },

  /**
   * Log info and show info toast (no "View Log" by default)
   */
  info(options: LogToastWithActionOptions) {
    const { source, title, details, context, showToast = true, showAction = false } = options;
    
    const logId = logStore.addLog({
      level: 'info',
      source,
      title,
      details,
      context
    });

    if (showToast) {
      if (showAction) {
        toast.info(title, {
          action: {
            label: 'View Log',
            onClick: () => {
              logStore.selectLog(logId);
              logStore.open();
            }
          }
        });
      } else {
        toast.info(title);
      }
    }

    return logId;
  },

  /**
   * Log only (no toast) - useful for background operations
   */
  log(level: LogLevel, options: LogToastOptions) {
    return logStore.addLog({
      level,
      ...options
    });
  }
};

/**
 * Simple helper to log without showing toast
 * Useful for logging successful operations quietly
 */
export function log(level: LogLevel, source: LogSource, title: string, details: string, context?: LogContext): string {
  return logStore.addLog({
    level,
    source,
    title,
    details,
    context
  });
}
