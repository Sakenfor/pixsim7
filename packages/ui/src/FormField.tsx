import React from 'react';
import clsx from 'clsx';

/**
 * FormField — canonical form field wrapper component.
 * REUSE this component for any labeled input/select/textarea across the app.
 *
 * Usage:
 * <FormField label="Email" required>
 *   <Input type="email" />
 * </FormField>
 *
 * <FormField label="Name" error="Name is required">
 *   <Input type="text" error />
 * </FormField>
 *
 * <FormField label="Bio" helpText="Tell us about yourself">
 *   <textarea className="..." />
 * </FormField>
 */
export interface FormFieldProps {
  /**
   * The label text to display above the field
   */
  label: string;
  /**
   * The form control element (Input, Select, textarea, etc.)
   */
  children: React.ReactNode;
  /**
   * Whether this field is required
   */
  required?: boolean;
  /**
   * Whether this field is optional (shows "(optional)" badge)
   */
  optional?: boolean;
  /**
   * Error message to display below the field
   */
  error?: string;
  /**
   * Help text to display below the field
   */
  helpText?: string;
  /**
   * Size variant for the label
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Additional CSS classes for the container
   */
  className?: string;
  /**
   * Additional CSS classes for the label
   */
  labelClassName?: string;
  /**
   * HTML id for the input (used for label association)
   */
  htmlFor?: string;
}

export function FormField({
  label,
  children,
  required = false,
  optional = false,
  error,
  helpText,
  size = 'sm',
  className,
  labelClassName,
  htmlFor,
}: FormFieldProps) {
  return (
    <div className={clsx('flex flex-col', className)}>
      <label
        htmlFor={htmlFor}
        className={clsx(
          'block font-medium text-neutral-700 dark:text-neutral-300 mb-1',
          size === 'sm' && 'text-xs',
          size === 'md' && 'text-sm mb-2',
          size === 'lg' && 'text-base mb-2',
          labelClassName
        )}
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-label="required">
            *
          </span>
        )}
        {optional && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
            (optional)
          </span>
        )}
      </label>

      {children}

      {error && (
        <span className="text-xs text-red-600 dark:text-red-400 mt-1">
          {error}
        </span>
      )}

      {!error && helpText && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          {helpText}
        </span>
      )}
    </div>
  );
}
