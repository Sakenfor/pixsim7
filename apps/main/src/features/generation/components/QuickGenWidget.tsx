/**
 * QuickGenWidget
 *
 * Shared wrapper that composes the full quickgen pipeline:
 *   scope sync → scope provider → widget provision → panel layout →
 *   storage key → context capability → panel host rendering.
 *
 * Consumers (CC, Viewer) plug in via children render prop and props.
 */

import { Ref } from '@pixsim7/shared.ref.core';
import type { DockviewApi } from 'dockview-core';
import {
  forwardRef,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';

import {
  CAP_GENERATION_CONTEXT,
  useProvideCapability,
  type GenerationContextSummary,
} from '@features/contextHub';
import { SuppressScopeWrapping } from '@features/panels';

import { isMultiAssetOperation } from '@/types/operations';
import type { OperationType } from '@/types/operations';


import { GenerationScopeProvider } from '../hooks/useGenerationScope';
import { useGenerationScopeStores } from '../hooks/useGenerationScope';
import { useProvideGenerationWidget } from '../hooks/useProvideGenerationWidget';
import { useQuickGenPanelLayout } from '../hooks/useQuickGenPanelLayout';
import { useQuickGenScopeSync } from '../hooks/useQuickGenScopeSync';
import type { InputItem } from '../stores/generationInputStore';

import {
  QuickGenPanelHost,
  QUICKGEN_PRESETS,
  type QuickGenPanelHostRef,
} from './QuickGenPanelHost';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context passed to children render prop. */
export interface QuickGenWidgetRenderContext {
  operationType: OperationType;
  generationId: number | null;
  operationInputs: InputItem[];
  widgetProviderId: string;
  setOperationType: (op: OperationType) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDynamicParams: Dispatch<SetStateAction<Record<string, any>>>;
  generate: () => void;
  generating: boolean;
  error: string | null;
}

export type GenerationContextExposure = 'none' | 'active' | 'mounted';

export interface QuickGenWidgetProps {
  /** Unique widget identifier (e.g. 'controlCenter' or 'viewerQuickGenerate'). */
  widgetId: string;
  /** Display label for capability providers. */
  label: string;
  /** Dockview panel-manager ID for the inner quickgen panel host. */
  panelManagerId: string;
  /** Outer dockview ID (for nested setups like CC inside a host dockview). */
  hostDockviewId?: string;
  /** Panel ID of the host panel in the outer dockview. */
  hostPanelId?: string;
  /** Panel IDs to render. Defaults to standard 3-panel set (asset, prompt, settings). */
  panelIds?: readonly string[];
  /** Priority for CAP_GENERATION_WIDGET capability. */
  priority: number;
  /** Whether the widget host is currently visible/open. */
  isOpen: boolean;
  /** Open/close the widget host. */
  setOpen: (open: boolean) => void;
  /** Include blocks panel in layout. */
  showBlocks?: boolean;
  /** @deprecated Use contextExposure instead. */
  provideContext?: boolean;
  /**
   * Controls whether/how CAP_GENERATION_CONTEXT is exposed:
   * - 'none': do not register generation context
   * - 'active': register and mark available only while widget is open (default)
   * - 'mounted': register and keep available while component is mounted
   */
  contextExposure?: GenerationContextExposure;
  /** Priority for the generation context capability. */
  contextPriority?: number;
  /** Prefix for the auto-computed storage key. Defaults to widgetId. */
  storageKeyPrefix?: string;
  /** Fully override the storage key (bypasses auto-computation). */
  storageKey?: string;
  /** CSS class applied to the outer wrapper div. */
  className?: string;
  /** Callback when the inner dockview is ready. */
  onReady?: (api: DockviewApi) => void;
  /** Extra context passed to panels via dockview. */
  context?: Record<string, unknown>;
  /** Minimum panels before showing tabs (default: 2). */
  minPanelsForTabs?: number;
  /** CSS class for the panel host wrapper div. Defaults to 'flex-1 min-h-0'. */
  panelHostClassName?: string;
  /** Render prop for consumer chrome. Called inside the scope + widget context. */
  children?: (ctx: QuickGenWidgetRenderContext) => ReactNode;
}

// ---------------------------------------------------------------------------
// Default panel IDs (3-panel set without blocks)
// ---------------------------------------------------------------------------
const DEFAULT_PANEL_IDS = QUICKGEN_PRESETS.full;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const QuickGenWidget = forwardRef<QuickGenPanelHostRef, QuickGenWidgetProps>(
  function QuickGenWidget(props, ref) {
    const {
      panelManagerId,
      hostDockviewId,
      hostPanelId,
      panelIds = DEFAULT_PANEL_IDS,
    } = props;

    // Step 1: Scope sync — keeps all quickgen panels in lockstep
    const { scopeInstanceId, scopeLabel } = useQuickGenScopeSync({
      panelManagerId: hostDockviewId ?? panelManagerId,
      innerDockviewId: panelManagerId,
      panelIds,
      hostPanelId,
    });

    // Step 2: Scope provider — isolated generation stores.
    // SuppressScopeWrapping prevents ScopeHost from double-wrapping inner
    // quickgen panels (quickgen-asset, quickgen-prompt, quickgen-settings)
    // with a second GenerationScopeProvider — they should all share this one.
    return (
      <GenerationScopeProvider scopeId={scopeInstanceId} label={scopeLabel} inheritParentScope={false}>
        <SuppressScopeWrapping scopes={['generation']}>
          <QuickGenWidgetInner {...props} ref={ref} />
        </SuppressScopeWrapping>
      </GenerationScopeProvider>
    );
  },
);

// ---------------------------------------------------------------------------
// Inner component (rendered inside GenerationScopeProvider)
// ---------------------------------------------------------------------------

const QuickGenWidgetInner = forwardRef<QuickGenPanelHostRef, QuickGenWidgetProps>(
  function QuickGenWidgetInner(
    {
      widgetId,
      label,
      panelManagerId,
      panelIds,
      priority,
      isOpen,
      setOpen,
      showBlocks = false,
      provideContext = true,
      contextExposure,
      contextPriority = 50,
      storageKeyPrefix,
      storageKey: storageKeyOverride,
      className,
      onReady,
      context: extraContext,
      minPanelsForTabs = 2,
      panelHostClassName,
      children,
    },
    ref,
  ) {
    const { id: scopeId } = useGenerationScopeStores();

    // Step 3: Widget provision — controller + scoped stores + CAP_GENERATION_WIDGET
    const {
      operationType,
      generationId,
      operationInputs,
      widgetProviderId,
      setOperationType,
      setDynamicParams,
      generate,
      generating,
      error,
    } = useProvideGenerationWidget({
      widgetId,
      label,
      priority,
      isOpen,
      setOpen,
    });

    // Step 4: Panel layout — panels, defaultLayout, resolvePanelPosition
    const layout = useQuickGenPanelLayout({ showBlocks, panelIds });
    const panelHostResetKey = useMemo(() => {
      const layoutShape = layout.panels.join('|');
      const usesTransitionLayout = operationType === 'video_transition';
      return `dockview:${layoutShape}:${usesTransitionLayout ? 'transition' : 'standard'}`;
    }, [layout.panels, operationType]);

    // Step 5: Storage key computation
    const storageKey = useMemo(() => {
      if (storageKeyOverride) return storageKeyOverride;
      const prefix = storageKeyPrefix ?? widgetId;
      const version = operationType === 'video_transition' ? 'v2t' : 'v2';
      const assetMode = layout.supportsInputs ? 'with-asset' : 'no-asset';
      const base = `dockview:${prefix}:${version}:${assetMode}`;
      return operationType ? `${base}:${operationType}` : base;
    }, [storageKeyOverride, storageKeyPrefix, widgetId, operationType, layout.supportsInputs]);

    // Step 6: Provide CAP_GENERATION_CONTEXT (optional)
    const isMultiAssetOp = isMultiAssetOperation(operationType);
    const resolvedContextExposure: GenerationContextExposure = contextExposure
      ?? (provideContext ? 'active' : 'none');
    const shouldProvideContext = resolvedContextExposure !== 'none';
    const contextIsAvailable = resolvedContextExposure === 'mounted' || isOpen;

    const generationContextValue = useMemo<GenerationContextSummary>(() => {
      const id = Number(generationId);
      const genRef = Number.isFinite(id) ? Ref.generation(id) : null;
      return {
        id: widgetId,
        label,
        mode: operationType,
        supportsMultiAsset: isMultiAssetOp,
        ref: genRef,
      };
    }, [widgetId, label, operationType, isMultiAssetOp, generationId]);

    const generationContextProvider = useMemo(
      () => ({
        id: `generation:${widgetId}`,
        label,
        priority: contextPriority,
        exposeToContextMenu: shouldProvideContext,
        isAvailable: () => contextIsAvailable,
        getValue: () => generationContextValue,
      }),
      [
        widgetId,
        label,
        contextPriority,
        shouldProvideContext,
        contextIsAvailable,
        generationContextValue,
      ],
    );

    useProvideCapability(
      CAP_GENERATION_CONTEXT,
      generationContextProvider,
      [generationContextValue, shouldProvideContext, contextIsAvailable],
      { scope: 'root', enabled: shouldProvideContext },
    );

    // Panel context (merged with extra context from consumer)
    const panelContext = useMemo(
      () => ({
        targetProviderId: widgetProviderId,
        sourceLabel: label,
        generationScopeId: scopeId,
        ...extraContext,
      }),
      [widgetProviderId, label, scopeId, extraContext],
    );

    // Step 7: Build render context for children
    const renderContext = useMemo<QuickGenWidgetRenderContext>(
      () => ({
        operationType,
        generationId,
        operationInputs,
        widgetProviderId,
        setOperationType,
        setDynamicParams,
        generate,
        generating,
        error,
      }),
      [
        operationType,
        generationId,
        operationInputs,
        widgetProviderId,
        setOperationType,
        setDynamicParams,
        generate,
        generating,
        error,
      ],
    );

    return (
      <div className={className ?? 'h-full flex flex-col'}>
        {/* Consumer chrome */}
        {children?.(renderContext)}
        {/* Panel host */}
        <div className={panelHostClassName ?? 'flex-1 min-h-0'}>
          <div
            key={panelHostResetKey}
            className="h-full relative"
          >
            <QuickGenPanelHost
              ref={ref}
              panels={layout.panels}
              storageKey={storageKey}
              context={panelContext}
              panelManagerId={panelManagerId}
              defaultLayout={layout.defaultLayout}
              resolvePanelPosition={layout.resolvePanelPosition}
              onReady={onReady}
              minPanelsForTabs={minPanelsForTabs}
            />
          </div>
        </div>
      </div>
    );
  },
);
