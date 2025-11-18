/**
 * Sora Provider Plugin
 *
 * Provides Sora-specific UI controls and validation for generation operations.
 */

import { defineGenerationUIPlugin } from '../generationPlugins';
import type { GenerationUIPluginProps } from '../generationPlugins';

/**
 * Sora-specific controls component
 */
function SoraControls({
  providerId,
  operationType,
  values,
  onChange,
  disabled,
}: GenerationUIPluginProps) {
  // Only show for Sora provider
  if (providerId !== 'sora') return null;

  return (
    <div className="space-y-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded">
      <div className="text-xs font-medium text-green-700 dark:text-green-300">
        Sora Advanced Controls
      </div>

      {/* Model selection */}
      <div>
        <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">
          Model
        </label>
        <select
          value={values.model || 'turbo'}
          onChange={(e) => onChange('model', e.target.value)}
          disabled={disabled}
          className="w-full p-1.5 text-xs border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
        >
          <option value="turbo">Turbo (faster, lower quality)</option>
          <option value="standard">Standard (balanced)</option>
        </select>
      </div>

      {/* Variant count */}
      <div>
        <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">
          Number of Variants
        </label>
        <input
          type="number"
          min={1}
          max={4}
          value={values.n_variants || 1}
          onChange={(e) => onChange('n_variants', parseInt(e.target.value, 10))}
          disabled={disabled}
          className="w-full p-1.5 text-xs border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
        />
        <div className="text-xs text-neutral-500 mt-1">
          Generate multiple variants (costs more credits)
        </div>
      </div>

      {/* Resolution controls */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">
            Width
          </label>
          <input
            type="number"
            min={256}
            max={1920}
            step={64}
            value={values.width || 480}
            onChange={(e) => onChange('width', parseInt(e.target.value, 10))}
            disabled={disabled}
            className="w-full p-1.5 text-xs border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">
            Height
          </label>
          <input
            type="number"
            min={256}
            max={1920}
            step={64}
            value={values.height || 480}
            onChange={(e) => onChange('height', parseInt(e.target.value, 10))}
            disabled={disabled}
            className="w-full p-1.5 text-xs border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Image input mode for image_to_video */}
      {operationType === 'image_to_video' && (
        <div>
          <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">
            Image Source
          </label>
          <select
            value={values.image_source_type || 'url'}
            onChange={(e) => onChange('image_source_type', e.target.value)}
            disabled={disabled}
            className="w-full p-1.5 text-xs border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
          >
            <option value="url">Image URL</option>
            <option value="media_id">Sora Media ID</option>
          </select>
          <div className="text-xs text-neutral-500 mt-1">
            Use "Media ID" for previously uploaded images
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Sora plugin definition
 */
export const soraPlugin = defineGenerationUIPlugin({
  id: 'sora-controls',
  providerId: 'sora',
  component: SoraControls,
  priority: 10,
  validate: (values) => {
    const errors: Record<string, string> = {};
    const warnings: Record<string, string> = {};

    // Validate resolution
    if (values.width && (values.width < 256 || values.width > 1920)) {
      errors.width = 'Width must be between 256 and 1920';
    }
    if (values.height && (values.height < 256 || values.height > 1920)) {
      errors.height = 'Height must be between 256 and 1920';
    }

    // Validate width/height are multiples of 64
    if (values.width && values.width % 64 !== 0) {
      errors.width = 'Width must be a multiple of 64';
    }
    if (values.height && values.height % 64 !== 0) {
      errors.height = 'Height must be a multiple of 64';
    }

    // Validate variant count
    if (values.n_variants && (values.n_variants < 1 || values.n_variants > 4)) {
      errors.n_variants = 'Number of variants must be between 1 and 4';
    }

    // Warn about high variant counts
    if (values.n_variants && values.n_variants > 2) {
      warnings.n_variants = `Generating ${values.n_variants} variants will use ${values.n_variants}x credits`;
    }

    // Warn about turbo model with high resolution
    if (
      values.model === 'turbo' &&
      values.width &&
      values.height &&
      values.width * values.height > 1280 * 720
    ) {
      warnings.model = 'Turbo model may not work well with high resolutions';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
    };
  },
  metadata: {
    name: 'Sora Advanced Controls',
    description: 'Sora-specific generation controls including model selection, variants, and resolution',
    version: '1.0.0',
  },
});
