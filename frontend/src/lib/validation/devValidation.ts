/**
 * Optional development-time validation for operation parameters.
 *
 * Enable by setting VITE_CC_DEV_VALIDATE=1 in .env.local
 *
 * This is a lightweight validation system that provides console warnings
 * during development to catch common parameter issues before API submission.
 * It does NOT block requests.
 */

import { validateOperationParams } from '../../types/operations';

/**
 * Check if dev validation is enabled
 */
export function isDevValidationEnabled(): boolean {
  return import.meta.env.VITE_CC_DEV_VALIDATE === '1';
}

/**
 * Validate operation parameters and log warnings if enabled.
 * Does not throw or block - only provides developer feedback.
 *
 * @param params - Parameters to validate
 * @param context - Optional context for better error messages (e.g., "QuickGenerate form")
 * @returns true if valid, false if validation errors found
 */
export function devValidateParams(
  params: Record<string, any>,
  context?: string
): boolean {
  if (!isDevValidationEnabled()) {
    return true; // Skip validation if not enabled
  }

  const errors = validateOperationParams(params);

  if (errors.length > 0) {
    const prefix = context ? `[CC-VALIDATION:${context}]` : '[CC-VALIDATION]';
    console.warn(`${prefix} Parameter validation warnings:`, {
      params,
      errors,
    });

    errors.forEach((err: string) => {
      console.warn(`${prefix}   • ${err}`);
    });

    return false;
  }

  return true;
}

/**
 * Validate and log info about the parameters being sent.
 * Useful for debugging what's actually being sent to the API.
 *
 * @param params - Parameters to log
 * @param context - Context string
 */
export function devLogParams(
  params: Record<string, any>,
  context: string = 'API call'
): void {
  if (!isDevValidationEnabled()) {
    return;
  }

  console.info(`[CC-VALIDATION:${context}]`, {
    operation_type: params.kind || params.operation_type || 'unknown',
    params,
    paramCount: Object.keys(params).length,
    requiredFields: Object.keys(params).filter(k => params[k] !== undefined && params[k] !== ''),
  });
}

/**
 * Create a validation wrapper for async functions.
 * Validates params before calling the function, but doesn't block the call.
 *
 * @param fn - Function to wrap
 * @param context - Context for validation messages
 * @returns Wrapped function
 */
export function withDevValidation<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: string
): T {
  return (async (...args: any[]) => {
    if (isDevValidationEnabled() && args[0]?.params) {
      devValidateParams(args[0].params, context);
      devLogParams(args[0].params, context);
    }
    return fn(...args);
  }) as T;
}
