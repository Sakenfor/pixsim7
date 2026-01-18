/**
 * Validation Context Hooks
 *
 * Hooks for accessing the validation context.
 * The context is provided by ValidationProvider component.
 */

import { useContext } from 'react';

import { ValidationContext, type ValidationContextValue } from './validationTypes';

/**
 * Hook to access validation context.
 * Must be used within a ValidationProvider.
 */
export function useValidationContext(): ValidationContextValue {
  const context = useContext(ValidationContext);
  if (!context) {
    throw new Error('useValidationContext must be used within a ValidationProvider');
  }
  return context;
}

/**
 * Hook to access validation context with fallback for non-provider usage.
 * Returns null if not within a ValidationProvider.
 */
export function useValidationContextOptional(): ValidationContextValue | null {
  return useContext(ValidationContext);
}
