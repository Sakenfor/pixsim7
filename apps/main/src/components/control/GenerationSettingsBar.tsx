import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { ParamSpec } from './DynamicParamForm';

/**
 * Provider option for the provider selector dropdown.
 */
interface ProviderOption {
  id: string;
  name: string;
}

/**
 * Props for the GenerationSettingsBar component.
 *
 * This component provides a compact, horizontal settings bar for generation
 * parameters. It's designed to be reusable across different generation UIs
 * (QuickGenerateModule, IntimacySceneComposer, dev tools, etc.).
 *
 * Usage:
 * ```tsx
 * <GenerationSettingsBar
 *   providerId={providerId}
 *   providers={providers}
 *   paramSpecs={paramSpecs}
 *   dynamicParams={dynamicParams}
 *   onChangeParam={(name, value) => setDynamicParams(prev => ({...prev, [name]: value}))}
 *   onChangeProvider={(id) => setProviderId(id)}
 *   generating={generating}
 *   showSettings={showSettings}
 *   onToggleSettings={() => setShowSettings(!showSettings)}
 * />
 * ```
 */
export interface GenerationSettingsBarProps {
  /** Currently selected provider ID, or undefined for "Auto" */
  providerId?: string;
  /** List of available providers to show in the dropdown */
  providers: ProviderOption[];
  /** Parameter specifications from the provider's operation_specs */
  paramSpecs: ParamSpec[];
  /** Current dynamic parameter values */
  dynamicParams: Record<string, any>;
  /** Callback when a parameter value changes */
  onChangeParam: (name: string, value: any) => void;
  /** Callback when provider selection changes (cleaner than using __provider__ sentinel) */
  onChangeProvider?: (providerId: string | undefined) => void;
  /** Whether generation is in progress (disables inputs) */
  generating?: boolean;
  /** Whether the settings bar is expanded/visible */
  showSettings: boolean;
  /** Callback to toggle settings visibility */
  onToggleSettings: () => void;
  /** Currently active preset ID (shown as a badge) */
  presetId?: string;
}

// Primary: common user-facing options that should be immediately visible
const PRIMARY_PARAM_NAMES = [
  'duration',
  'quality',
  'aspect_ratio',
  'model',
  'model_version',
  'seconds',
  'style',
  'resolution',
];

/**
 * GenerationSettingsBar
 *
 * A compact, horizontal settings bar for generation parameters.
 * Displays primary parameters (model, quality, aspect_ratio, etc.) as inline
 * dropdowns, with advanced parameters (booleans, seed, etc.) in a popover.
 *
 * This component is provider-agnostic - it works with any provider that
 * returns operation_specs with parameters. The split between primary and
 * advanced is based on PRIMARY_PARAM_NAMES and whether the param has an enum.
 *
 * @example
 * // In QuickGenerateModule:
 * <GenerationSettingsBar
 *   providerId={providerId}
 *   providers={providers}
 *   paramSpecs={paramSpecs}
 *   dynamicParams={dynamicParams}
 *   onChangeParam={handleDynamicParamChange}
 *   onChangeProvider={setProvider}
 *   generating={generating}
 *   showSettings={showSettings}
 *   onToggleSettings={() => setShowSettings(!showSettings)}
 *   presetId={presetId}
 * />
 */
export function GenerationSettingsBar({
  providerId,
  providers,
  paramSpecs,
  dynamicParams,
  onChangeParam,
  onChangeProvider,
  generating = false,
  showSettings,
  onToggleSettings,
  presetId,
}: GenerationSettingsBarProps) {
  const [expandedSetting, setExpandedSetting] = useState<string | null>(null);

  // Primary params: shown directly in the bar as inline selects (only enums)
  const primaryParams = useMemo(
    () => paramSpecs.filter((p) => PRIMARY_PARAM_NAMES.includes(p.name) && p.enum),
    [paramSpecs]
  );

  // Advanced params: shown in a popover (non-primary or non-enum types like booleans)
  const advancedParams = useMemo(
    () => paramSpecs.filter((p) => !PRIMARY_PARAM_NAMES.includes(p.name) || !p.enum),
    [paramSpecs]
  );

  function handleChange(name: string, value: any) {
    onChangeParam(name, value);
  }

  function handleProviderChange(newProviderId: string | undefined) {
    if (onChangeProvider) {
      onChangeProvider(newProviderId);
    } else {
      // Fallback: use __provider__ sentinel for backward compatibility
      onChangeParam('__provider__', newProviderId);
    }
  }

  return (
    <>
      {/* Settings bar - expands left horizontally */}
      {showSettings && (
        <div className="flex items-center gap-1 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-l-md border-r-0 animate-in slide-in-from-right-2 duration-150">
          {/* Provider selector - inline */}
          <select
            value={providerId ?? ''}
            onChange={(e) => handleProviderChange(e.target.value || undefined)}
            disabled={generating}
            className="px-1.5 py-1 text-[10px] rounded bg-white dark:bg-neutral-700 border-0 disabled:opacity-50 cursor-pointer"
            title="Provider"
          >
            <option value="">Auto</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Primary params - shown directly as small selects */}
          {primaryParams.map((param) => (
            <select
              key={param.name}
              value={dynamicParams[param.name] ?? param.default ?? ''}
              onChange={(e) => handleChange(param.name, e.target.value)}
              disabled={generating}
              className="px-1.5 py-1 text-[10px] rounded bg-white dark:bg-neutral-700 border-0 disabled:opacity-50 cursor-pointer max-w-[80px]"
              title={param.name}
            >
              {param.enum ? (
                param.enum.map((opt: string) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))
              ) : (
                <option value={dynamicParams[param.name] ?? ''}>
                  {dynamicParams[param.name] ?? param.name}
                </option>
              )}
            </select>
          ))}

          {/* Advanced params button - only if there are additional params */}
          {advancedParams.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setExpandedSetting(expandedSetting === 'advanced' ? null : 'advanced')}
                className={clsx(
                  'px-2 py-1 text-[10px] rounded transition-colors',
                  expandedSetting === 'advanced'
                    ? 'bg-white dark:bg-neutral-700 shadow-sm'
                    : 'hover:bg-white/50 dark:hover:bg-neutral-700/50'
                )}
              >
                +{advancedParams.length}
              </button>
              {expandedSetting === 'advanced' && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg p-2 min-w-[180px] max-h-[250px] overflow-y-auto space-y-2">
                  {advancedParams.map((param) => (
                    <div key={param.name} className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-500 min-w-[60px]">
                        {param.name.replace(/_/g, ' ')}
                      </span>
                      {param.enum ? (
                        <select
                          value={dynamicParams[param.name] ?? param.default ?? ''}
                          onChange={(e) => handleChange(param.name, e.target.value)}
                          disabled={generating}
                          className="flex-1 p-1 text-[10px] border rounded bg-white dark:bg-neutral-800 disabled:opacity-50"
                        >
                          <option value="">-</option>
                          {param.enum.map((opt: string) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : param.type === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={!!dynamicParams[param.name]}
                          onChange={(e) => handleChange(param.name, e.target.checked)}
                          disabled={generating}
                          className="w-3 h-3"
                        />
                      ) : (
                        <input
                          type={param.type === 'number' ? 'number' : 'text'}
                          value={dynamicParams[param.name] ?? ''}
                          onChange={(e) =>
                            handleChange(
                              param.name,
                              param.type === 'number' ? Number(e.target.value) : e.target.value
                            )
                          }
                          disabled={generating}
                          placeholder={param.default?.toString()}
                          className="flex-1 p-1 text-[10px] border rounded bg-white dark:bg-neutral-800 disabled:opacity-50 w-16"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preset indicator */}
          {presetId && (
            <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
              {presetId}
            </span>
          )}
        </div>
      )}

      {/* Settings toggle */}
      <button
        onClick={() => {
          onToggleSettings();
          setExpandedSetting(null);
        }}
        className={clsx(
          'p-1.5 rounded transition-colors',
          showSettings
            ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100'
            : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'
        )}
        title="Generation settings"
      >
        <span className="text-[11px]">⚙</span>
      </button>
    </>
  );
}

