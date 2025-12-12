/**
 * Pixverse Provider Plugin
 *
 * Provides Pixverse-specific UI controls and validation for generation operations.
 */

import { defineGenerationUIPlugin } from '../core/generationPlugins';
import type { GenerationUIPluginProps } from '../core/generationPlugins';

/**
 * Pixverse-specific controls component
 */
function PixverseControls({
  providerId,
  operationType,
  values,
  onChange,
  disabled,
}: GenerationUIPluginProps) {
  // Only show for Pixverse provider
  if (providerId !== 'pixverse') return null;

  return (
    <div className="space-y-3 p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded">
      <div className="text-xs font-medium text-purple-700 dark:text-purple-300">
        Pixverse Advanced Controls
      </div>

      {/* Motion mode for text_to_video */}
      {operationType === 'text_to_video' && (
        <div>
          <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">
            Motion Mode
          </label>
          <select
            value={values.motion_mode || 'auto'}
            onChange={(e) => onChange('motion_mode', e.target.value)}
            disabled={disabled}
            className="w-full p-1.5 text-xs border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
          >
            <option value="auto">Auto</option>
            <option value="slow">Slow Motion</option>
            <option value="fast">Fast Motion</option>
          </select>
        </div>
      )}

      {/* Camera movement for image_to_video */}
      {operationType === 'image_to_video' && (
        <div>
          <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">
            Camera Movement
          </label>
          <select
            value={values.camera_movement || 'none'}
            onChange={(e) => onChange('camera_movement', e.target.value)}
            disabled={disabled}
            className="w-full p-1.5 text-xs border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
          >
            <option value="none">None</option>
            <option value="zoom_in">Zoom In</option>
            <option value="zoom_out">Zoom Out</option>
            <option value="pan_left">Pan Left</option>
            <option value="pan_right">Pan Right</option>
            <option value="tilt_up">Tilt Up</option>
            <option value="tilt_down">Tilt Down</option>
          </select>
        </div>
      )}

      {/* Negative prompt */}
      <div>
        <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">
          Negative Prompt (Optional)
        </label>
        <textarea
          value={values.negative_prompt || ''}
          onChange={(e) => onChange('negative_prompt', e.target.value)}
          disabled={disabled}
          placeholder="Describe what to avoid..."
          className="w-full p-2 text-xs border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
          rows={2}
        />
      </div>

      {/* Style preset */}
      <div>
        <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">
          Style
        </label>
        <select
          value={values.style || 'realistic'}
          onChange={(e) => onChange('style', e.target.value)}
          disabled={disabled}
          className="w-full p-1.5 text-xs border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
        >
          <option value="realistic">Realistic</option>
          <option value="anime">Anime</option>
          <option value="3d">3D</option>
          <option value="fantasy">Fantasy</option>
          <option value="cinematic">Cinematic</option>
        </select>
      </div>
    </div>
  );
}

/**
 * Pixverse plugin definition
 */
export const pixversePlugin = defineGenerationUIPlugin({
  id: 'pixverse-controls',
  providerId: 'pixverse',
  component: PixverseControls,
  priority: 10,
  validate: (values) => {
    const errors: Record<string, string> = {};
    const warnings: Record<string, string> = {};

    // Validate negative prompt length
    if (values.negative_prompt && values.negative_prompt.length > 500) {
      errors.negative_prompt = 'Negative prompt should not exceed 500 characters';
    }

    // Warn about motion mode with image_to_video
    if (values.motion_mode && values.camera_movement) {
      warnings.motion_mode = 'Motion mode is ignored when camera movement is specified';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
    };
  },
  metadata: {
    name: 'Pixverse Advanced Controls',
    description: 'Pixverse-specific generation controls including motion, camera movement, and style',
    version: '1.0.0',
  },
});
