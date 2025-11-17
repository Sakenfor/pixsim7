import type { InteractionPlugin, BaseInteractionConfig, FormField } from './types';

interface InteractionConfigFormProps<TConfig extends BaseInteractionConfig> {
  plugin: InteractionPlugin<TConfig>;
  config: TConfig;
  onConfigChange: (config: TConfig) => void;
}

export function InteractionConfigForm<TConfig extends BaseInteractionConfig>({
  plugin,
  config,
  onConfigChange,
}: InteractionConfigFormProps<TConfig>) {
  const updateField = (key: string, value: any) => {
    onConfigChange({
      ...config,
      [key]: value,
    });
  };

  const renderField = (field: FormField) => {
    const value = (config as any)[field.key];

    switch (field.type) {
      case 'boolean':
        return (
          <div key={field.key}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value ?? false}
                onChange={(e) => updateField(field.key, e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-neutral-500">{field.label}</span>
            </label>
            {field.description && (
              <p className="text-xs text-neutral-500 mt-1 ml-6">{field.description}</p>
            )}
          </div>
        );

      case 'number':
        return (
          <div key={field.key}>
            <label className="block text-xs text-neutral-500 mb-1">{field.label}</label>
            <input
              className="w-full text-xs bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1.5"
              type="number"
              value={value ?? ''}
              onChange={(e: any) =>
                updateField(
                  field.key,
                  e.target.value ? Number(e.target.value) : null
                )
              }
              step={field.step}
              min={field.min}
              max={field.max}
              placeholder={field.placeholder}
            />
            {field.description && (
              <p className="text-xs text-neutral-500 mt-1">{field.description}</p>
            )}
          </div>
        );

      case 'text':
        return (
          <div key={field.key}>
            <label className="block text-xs text-neutral-500 mb-1">{field.label}</label>
            <input
              className="w-full text-xs bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1.5"
              type="text"
              value={value ?? ''}
              onChange={(e: any) => updateField(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
            {field.description && (
              <p className="text-xs text-neutral-500 mt-1">{field.description}</p>
            )}
          </div>
        );

      case 'select':
        return (
          <div key={field.key}>
            <label className="block text-xs text-neutral-500 mb-1">{field.label}</label>
            <select
              className="w-full text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1.5"
              value={value ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                // Try to parse as number if it looks like one
                const parsed = !isNaN(Number(val)) ? Number(val) : val;
                updateField(field.key, parsed);
              }}
            >
              {!value && <option value="">Select...</option>}
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {field.description && (
              <p className="text-xs text-neutral-500 mt-1">{field.description}</p>
            )}
          </div>
        );

      case 'tags':
        return (
          <div key={field.key}>
            <label className="block text-xs text-neutral-500 mb-1">{field.label}</label>
            <input
              className="w-full text-xs bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1.5"
              type="text"
              value={Array.isArray(value) ? value.join(', ') : ''}
              onChange={(e: any) =>
                updateField(
                  field.key,
                  e.target.value
                    .split(',')
                    .map((v: string) => v.trim())
                    .filter(Boolean)
                )
              }
              placeholder={field.placeholder}
            />
            {field.description && (
              <p className="text-xs text-neutral-500 mt-1">{field.description}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="ml-6 space-y-2">
      {plugin.configFields.map(renderField)}
    </div>
  );
}
