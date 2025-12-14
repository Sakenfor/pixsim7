import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import { useEditorContext, type EditorContext, type EditorMode } from '@lib/context/editorContext';
import type { PanelId } from '@/stores/workspaceStore';
import { PanelHeader } from '@/components/panels/shared/PanelHeader';
import { panelRegistry, type ContextLabelStrategy, type CoreEditorRole } from './panelRegistry';

type PanelHostVariant = 'standalone' | 'embedded' | 'dockview';

export interface PanelHostLiteProps {
  panelId: PanelId;
  className?: string;
  style?: CSSProperties;
  /**
   * Hide the standard panel header chrome. Useful when embedding panel content
   * inside another layout that already has its own heading.
   */
  hideHeader?: boolean;
  /**
   * Optional slot rendered next to the standard panel title (within the header).
   * Ignored when hideHeader is true.
   */
  headerSlot?: ReactNode;
  /**
   * Custom fallback UI when the requested panel cannot be found.
   */
  fallback?: ReactNode | ((panelId: PanelId) => ReactNode);
  /**
   * Whether to stretch the content to flex-1 (default true). Disable when you
   * need the panel to size to its content.
   */
  fill?: boolean;
  /**
   * Variants adjust the chrome so the host blends into its surroundings.
   * - standalone: card-like chrome with rounded corners (default)
   * - embedded: subtle border without drop shadow
   * - dockview: no outer chrome; relies on Dockview container
   */
  variant?: PanelHostVariant;
}

function getModeLabel(mode: EditorMode): string | null {
  switch (mode) {
    case 'play':
      return 'Play';
    case 'edit-flow':
      return 'Edit Flow';
    case 'layout':
      return 'Layout';
    case 'debug':
      return 'Debug';
    default:
      return null;
  }
}

function resolveContextLabel(
  strategy: ContextLabelStrategy | undefined,
  ctx: EditorContext,
  coreEditorRole?: CoreEditorRole
): string | undefined {
  let baseLabel: string | undefined;

  if (strategy) {
    if (typeof strategy === 'function') {
      baseLabel = strategy(ctx);
    } else {
      switch (strategy) {
        case 'scene':
          baseLabel = ctx.scene.title ?? undefined;
          break;
        case 'world':
          baseLabel = ctx.world.id ? `World #${ctx.world.id}` : undefined;
          break;
        case 'session':
          baseLabel = ctx.runtime.sessionId
            ? `Session #${ctx.runtime.sessionId}`
            : ctx.world.id
              ? `World #${ctx.world.id}`
              : undefined;
          break;
        case 'preset':
          baseLabel = ctx.workspace.activePresetId
            ? `Preset: ${ctx.workspace.activePresetId}`
            : undefined;
          break;
      }
    }
  }

  if (coreEditorRole) {
    const modeLabel = getModeLabel(ctx.editor.mode);
    if (modeLabel) {
      if (baseLabel) {
        return `${modeLabel} ƒ?› ${baseLabel}`;
      }
      return modeLabel;
    }
  }

  return baseLabel;
}

export function PanelHostLite({
  panelId,
  className,
  style,
  hideHeader = false,
  headerSlot,
  fallback,
  fill = true,
  variant = 'standalone',
}: PanelHostLiteProps) {
  const panelDef = panelRegistry.get(panelId);
  const ctx = useEditorContext();

  if (!panelDef) {
    if (typeof fallback === 'function') {
      return <>{fallback(panelId)}</>;
    }
    return (
      <div className={clsx('rounded border border-red-200 px-3 py-2 text-sm text-red-600', className)}>
        Missing panel: {panelId}
      </div>
    );
  }

  const Component = panelDef.component;
  const contextLabel = resolveContextLabel(panelDef.contextLabel, ctx, panelDef.coreEditorRole);

  const chromeClass =
    variant === 'dockview'
      ? 'panel-host-lite flex flex-col h-full w-full bg-white dark:bg-neutral-900'
      : variant === 'embedded'
        ? 'panel-host-lite flex flex-col rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
        : 'panel-host-lite flex flex-col rounded-md border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900';

  return (
    <div
      className={clsx(chromeClass, className)}
      style={style}
      data-panel-id={panelId}
    >
      {!hideHeader && (
        <PanelHeader
          title={panelDef.title}
          category={panelDef.category}
          contextLabel={contextLabel}
          className="rounded-t-md"
        >
          {headerSlot}
        </PanelHeader>
      )}
      <div className={clsx(fill ? 'flex-1 min-h-0' : undefined, 'overflow-auto')}>
        <Component />
      </div>
    </div>
  );
}
