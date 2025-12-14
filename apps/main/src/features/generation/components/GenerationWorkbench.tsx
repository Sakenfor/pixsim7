/**
 * GenerationWorkbench Component
 *
 * A reusable generation UI wrapper that provides settings bar, generate button,
 * error display, and status tracking. Consumers customize the layout through
 * render props (renderHeader, renderContent, renderFooter).
 *
 * For prompt companion integration, use the `renderFooter` prop to add a
 * PromptCompanionHost:
 *
 * ```tsx
 * import { PromptCompanionHost } from '@lib/ui/promptCompanionSlot';
 *
 * <GenerationWorkbench
 *   // ... other props
 *   renderFooter={() => (
 *     <PromptCompanionHost
 *       surface="generation-workbench"
 *       promptValue={prompt}
 *       setPromptValue={setPrompt}
 *     />
 *   )}
 * />
 * ```
 */

import React from 'react';
import clsx from 'clsx';
import { GenerationSettingsBar, GenerationStatusDisplay, type ParamSpec } from '@lib/generation-ui';
import { ThemedIcon } from '@lib/icons';
import { useGenerationsStore } from '@features/generation';
import type { GenerationResponse } from '@lib/api/generations';

/**
 * Context provided to render props for accessing workbench state.
 */
export interface WorkbenchRenderContext {
  /** Whether generation is in progress */
  generating: boolean;
  /** Current error message, if any */
  error: string | null;
  /** Current generation ID being tracked */
  generationId: number | null;
  /** Hook into stored generation entries */
  generations: Map<number, GenerationResponse>;
}

/**
 * Props for the GenerationWorkbench component.
 *
 * The workbench provides a reusable generation UI with:
 * - Settings bar (provider selector + parameter controls)
 * - Generate button
 * - Error display
 * - Generation status tracking
 *
 * Callers can customize the layout through render props and toggles.
 */
export interface GenerationWorkbenchProps {
  // ─────────────────────────────────────────────────────────────────────────
  // Settings Bar Props (passed through to GenerationSettingsBar)
  // ─────────────────────────────────────────────────────────────────────────

  /** Currently selected provider ID */
  providerId?: string;
  /** List of available providers */
  providers: Array<{ id: string; name: string }>;
  /** Parameter specifications for the current operation */
  paramSpecs: ParamSpec[];
  /** Current dynamic parameter values */
  dynamicParams: Record<string, any>;
  /** Callback when a parameter value changes */
  onChangeParam: (name: string, value: any) => void;
  /** Callback when provider selection changes */
  onChangeProvider?: (providerId: string | undefined) => void;
  /** Whether generation is in progress */
  generating?: boolean;
  /** Whether the settings bar is visible */
  showSettings: boolean;
  /** Callback to toggle settings visibility */
  onToggleSettings: () => void;
  /** Currently active preset ID */
  presetId?: string;
  /** Operation type for cost estimation */
  operationType?: string;

  // ─────────────────────────────────────────────────────────────────────────
  // Generation Action
  // ─────────────────────────────────────────────────────────────────────────

  /** Callback when generate button is clicked */
  onGenerate: () => void;
  /** Whether the generate button should be enabled */
  canGenerate?: boolean;
  /** Label for the generate button. Defaults to "Go" */
  generateButtonLabel?: React.ReactNode;
  /** Title/tooltip for the generate button */
  generateButtonTitle?: string;

  // ─────────────────────────────────────────────────────────────────────────
  // Error & Status
  // ─────────────────────────────────────────────────────────────────────────

  /** Current error message to display */
  error?: string | null;
  /** Generation ID to track status for */
  generationId?: number | null;

  // ─────────────────────────────────────────────────────────────────────────
  // Visibility Toggles
  // ─────────────────────────────────────────────────────────────────────────

  /** Hide the error display */
  hideErrorDisplay?: boolean;
  /** Hide the generation status display */
  hideStatusDisplay?: boolean;
  /** Hide the generate button (useful when caller renders their own) */
  hideGenerateButton?: boolean;
  /** Hide the settings bar from header (when rendering settings elsewhere) */
  hideSettingsBar?: boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // Render Props / Slots
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Render custom content in the header row (left side, before settings bar).
   * Typically used for operation type selectors, presets, etc.
   */
  renderHeader?: (context: WorkbenchRenderContext) => React.ReactNode;

  /**
   * Render the main content area (prompt input, asset display, etc.).
   * This is the primary customization point for different generation UIs.
   */
  renderContent?: (context: WorkbenchRenderContext) => React.ReactNode;

  /**
   * Render custom content after the main content area.
   * Useful for additional controls or information.
   */
  renderFooter?: (context: WorkbenchRenderContext) => React.ReactNode;

  // ─────────────────────────────────────────────────────────────────────────
  // Styling
  // ─────────────────────────────────────────────────────────────────────────

  /** Additional class name for the root container */
  className?: string;
  /** Whether to use compact styling */
  compact?: boolean;
}

/**
 * GenerationWorkbench
 *
 * A reusable component that encapsulates the common UI patterns for generation:
 * - Header row with settings bar and generate button
 * - Main content area (customizable via renderContent)
 * - Error display
 * - Generation status tracking
 * - Optional recent prompts
 *
 * This component is designed to be the foundation for QuickGenerateModule,
 * IntimacySceneComposer's generation panel, and other generation UIs.
 *
 * @example
 * ```tsx
 * <GenerationWorkbench
 *   providerId={providerId}
 *   providers={providers}
 *   paramSpecs={paramSpecs}
 *   dynamicParams={dynamicParams}
 *   onChangeParam={handleParamChange}
 *   onChangeProvider={setProvider}
 *   generating={generating}
 *   showSettings={showSettings}
 *   onToggleSettings={toggleSettings}
 *   onGenerate={generate}
 *   canGenerate={prompt.trim().length > 0}
 *   error={error}
 *   generationId={generationId}
 *   renderHeader={() => <OperationTypeSelector />}
 *   renderContent={() => <PromptInput value={prompt} onChange={setPrompt} />}
 * />
 * ```
 */
export function GenerationWorkbench({
  // Settings bar props
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
  operationType,

  // Generation action
  onGenerate,
  canGenerate = true,
  generateButtonLabel,
  generateButtonTitle,

  // Error & status
  error,
  generationId,

  // Visibility toggles
  hideErrorDisplay = false,
  hideStatusDisplay = false,
  hideGenerateButton = false,
  hideSettingsBar = false,

  // Render props
  renderHeader,
  renderContent,
  renderFooter,

  // Styling
  className,
  compact = false,
}: GenerationWorkbenchProps) {
  const generationsStore = useGenerationsStore((state) => state.generations);
  const context: WorkbenchRenderContext = {
    generating,
    error: error ?? null,
    generationId: generationId ?? null,
    generations: generationsStore,
  };

  const defaultButtonLabel = (
    <span className="flex items-center gap-1">
      <ThemedIcon name="zap" size={12} variant="default" />
      Go
    </span>
  );
  const headerSlot = renderHeader?.(context);
  const showHeaderRow = headerSlot || !hideSettingsBar || !hideGenerateButton;

  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      {/* Header Row: Unified compact control bar */}
      {showHeaderRow && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-100/80 dark:bg-neutral-800/80 rounded-xl">
          {/* Custom header content (operation selector, presets, etc.) */}
          {headerSlot && (
            <div className="flex items-center gap-1">{headerSlot}</div>
          )}

          <div className="flex-1" />

          {/* Generation settings bar */}
          {!hideSettingsBar && (
            <GenerationSettingsBar
              providerId={providerId}
              providers={providers}
              paramSpecs={paramSpecs}
              dynamicParams={dynamicParams}
              onChangeParam={onChangeParam}
              onChangeProvider={onChangeProvider}
              generating={generating}
              showSettings={showSettings}
              onToggleSettings={onToggleSettings}
              presetId={presetId}
              operationType={operationType}
            />
          )}

          {/* Generate button */}
          {!hideGenerateButton && (
            <button
              onClick={onGenerate}
              disabled={generating || !canGenerate}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                generating || !canGenerate
                  ? 'bg-neutral-400'
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
              )}
              title={generateButtonTitle ?? (generating ? 'Generating...' : 'Generate (Enter)')}
            >
              {generating ? (
                <ThemedIcon name="loader" size={14} variant="default" className="animate-spin" />
              ) : (
                generateButtonLabel ?? defaultButtonLabel
              )}
            </button>
          )}
        </div>
      )}

      {/* Main content area */}
      {renderContent && (
        <div className="flex-1 flex flex-col gap-3 min-h-0">{renderContent(context)}</div>
      )}

      {/* Error display */}
      {!hideErrorDisplay && error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded flex-shrink-0 border border-red-200 dark:border-red-800">
          <div className="flex items-start gap-2">
            <ThemedIcon
              name="alertCircle"
              size={14}
              variant="default"
              className="flex-shrink-0 mt-0.5"
            />
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* Generation status */}
      {!hideStatusDisplay && generationId && (
        <GenerationStatusDisplay generationId={generationId} />
      )}

      {/* Custom footer content */}
      {renderFooter?.(context)}
    </div>
  );
}

/**
 * Re-export for convenience
 */
export { GenerationSettingsBar, GenerationStatusDisplay } from '@lib/generation-ui';
