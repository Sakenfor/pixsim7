import { useState } from 'react';
import { Button } from '@pixsim7/shared.ui';
import type { TemplateWizard, WizardField, WizardValues } from '../../lib/graph/templateWizards';

interface TemplateWizardDialogProps {
  wizard: TemplateWizard;
  onComplete: (nodes: any[], edges: any[]) => void;
  onCancel: () => void;
}

/**
 * Phase 7: Template Wizard Dialog
 *
 * Displays a form-based wizard for creating common scene patterns
 */
export function TemplateWizardDialog({
  wizard,
  onComplete,
  onCancel,
}: TemplateWizardDialogProps) {
  // Initialize form values with defaults
  const initialValues: WizardValues = {};
  wizard.fields.forEach((field) => {
    if (field.defaultValue !== undefined) {
      initialValues[field.id] = field.defaultValue;
    } else if (field.type === 'checkbox') {
      initialValues[field.id] = false;
    } else if (field.type === 'number') {
      initialValues[field.id] = 0;
    } else {
      initialValues[field.id] = '';
    }
  });

  const [values, setValues] = useState<WizardValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (fieldId: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    // Clear error for this field
    if (errors[fieldId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    wizard.fields.forEach((field) => {
      const value = values[field.id];

      // Required field validation
      if (field.required && !value) {
        newErrors[field.id] = 'This field is required';
        return;
      }

      // Type-specific validation
      if (field.type === 'number' && typeof value === 'number') {
        if (field.validation?.min !== undefined && value < field.validation.min) {
          newErrors[field.id] = `Must be at least ${field.validation.min}`;
        }
        if (field.validation?.max !== undefined && value > field.validation.max) {
          newErrors[field.id] = `Must be at most ${field.validation.max}`;
        }
      }

      if (field.type === 'text' && typeof value === 'string' && field.validation?.pattern) {
        if (!field.validation.pattern.test(value)) {
          newErrors[field.id] = 'Invalid format';
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) {
      return;
    }

    try {
      const { nodes, edges } = wizard.generateTemplate(values);
      onComplete(nodes, edges);
    } catch (error) {
      alert(`Failed to generate template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const renderField = (field: WizardField) => {
    const value = values[field.id];
    const error = errors[field.id];

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={value as string}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ${
              error
                ? 'border-red-500 dark:border-red-400'
                : 'border-neutral-300 dark:border-neutral-600'
            }`}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={value as number}
            onChange={(e) => handleFieldChange(field.id, parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder}
            min={field.validation?.min}
            max={field.validation?.max}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ${
              error
                ? 'border-red-500 dark:border-red-400'
                : 'border-neutral-300 dark:border-neutral-600'
            }`}
          />
        );

      case 'select':
        return (
          <select
            value={value as string}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ${
              error
                ? 'border-red-500 dark:border-red-400'
                : 'border-neutral-300 dark:border-neutral-600'
            }`}
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value as boolean}
              onChange={(e) => handleFieldChange(field.id, e.target.checked)}
              className="rounded border-neutral-300 dark:border-neutral-600"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              {field.description || field.label}
            </span>
          </label>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2 mb-1">
            {wizard.icon && <span className="text-2xl">{wizard.icon}</span>}
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {wizard.name}
            </h2>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {wizard.description}
          </p>
        </div>

        {/* Form Fields */}
        <div className="p-4 space-y-4">
          {wizard.fields.map((field) => (
            <div key={field.id}>
              <label className="block mb-2">
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {field.label}
                  </span>
                  {field.required && (
                    <span className="text-red-500 text-sm">*</span>
                  )}
                </div>
                {field.description && field.type !== 'checkbox' && (
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                    {field.description}
                  </div>
                )}
                {renderField(field)}
              </label>
              {errors[field.id] && (
                <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                  {errors[field.id]}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 flex gap-2 justify-end">
          <Button size="md" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="md" variant="primary" onClick={handleSubmit}>
            Create Pattern
          </Button>
        </div>
      </div>
    </div>
  );
}
