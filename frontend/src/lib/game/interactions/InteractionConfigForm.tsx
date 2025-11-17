/**
 * Generic Interaction Configuration Form
 *
 * Renders a form for any interaction plugin based on its configFields definition.
 * This eliminates the need to manually create UI for each interaction type.
 */

import { Input } from '@pixsim7/ui';
import type { InteractionPlugin, FormField } from './types';

interface InteractionConfigFormProps {
  plugin: InteractionPlugin;
  config: any;
  onConfigChange: (config: any) => void;
}

export function InteractionConfigForm({
  plugin,
  config,
  onConfigChange,
}: InteractionConfigFormProps) {
  const updateField = (key: string, value: any) => {
    onConfigChange({
      ...config,
      [key]: value,
    });
  };

  const renderField = (field: FormField) => {
    const value = config[field.key];

    switch (field.type) {
      case 'number':
        return (
          <div key={field.key}>
            <label className="block text-xs text-neutral-500 mb-1">{field.label}</label>
            <Input
              type="number"
              value={value ?? ''}
              onChange={(e: any) => {
                const v = e.target.value;
                updateField(field.key, v ? Number(v) : null);
              }}
              min={field.min}
              max={field.max}
              step={field.step}
              placeholder={field.placeholder}
            />
          </div>
        );

      case 'text':
        return (
          <div key={field.key}>
            <label className="block text-xs text-neutral-500 mb-1">{field.label}</label>
            <Input
              value={value ?? ''}
              onChange={(e: any) => updateField(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        );

      case 'array':
        return (
          <div key={field.key}>
            <label className="block text-xs text-neutral-500 mb-1">{field.label}</label>
            <Input
              value={Array.isArray(value) ? value.join(', ') : ''}
              onChange={(e: any) => {
                const arr = e.target.value
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean);
                updateField(field.key, arr);
              }}
              placeholder={field.placeholder}
            />
            {field.help && (
              <p className="text-xs text-neutral-500 mt-1">{field.help}</p>
            )}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.key}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value ?? false}
                onChange={(e) => updateField(field.key, e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-medium">{field.label}</span>
            </label>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        {plugin.icon && <span className="text-lg">{plugin.icon}</span>}
        <div>
          <h5 className="text-xs font-semibold">{plugin.name}</h5>
          <p className="text-xs text-neutral-500">{plugin.description}</p>
        </div>
      </div>
      <div className="ml-6 space-y-2">
        {plugin.configFields.map((field) => renderField(field))}
      </div>
    </div>
  );
}
