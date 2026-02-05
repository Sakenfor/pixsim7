/**
 * Editor Toolbar Component
 *
 * Provides standard toolbar controls for graph editors including
 * undo/redo buttons and dirty state indicator.
 */

import { Undo2, Redo2, Save } from 'lucide-react';
import { clsx } from 'clsx';
import type { EditorToolbarProps } from '../types';

/**
 * Standard editor toolbar with undo/redo and optional save
 *
 * @example
 * ```tsx
 * <EditorToolbar
 *   onUndo={undo}
 *   onRedo={redo}
 *   canUndo={canUndo}
 *   canRedo={canRedo}
 *   isDirty={isDirty}
 *   onSave={handleSave}
 * >
 *   <button onClick={handleExport}>Export</button>
 * </EditorToolbar>
 * ```
 */
export function EditorToolbar({
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isDirty = false,
  onSave,
  children,
  position = 'left',
  className,
}: EditorToolbarProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2',
        position === 'center' && 'justify-center',
        position === 'right' && 'justify-end',
        className
      )}
    >
      {/* Undo/Redo buttons */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={14} />
        </ToolbarButton>

        <ToolbarButton
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 size={14} />
        </ToolbarButton>
      </div>

      {/* Save button (if handler provided) */}
      {onSave && (
        <ToolbarButton
          onClick={onSave}
          disabled={!isDirty}
          title="Save (Ctrl+S)"
          aria-label="Save"
        >
          <Save size={14} />
        </ToolbarButton>
      )}

      {/* Dirty indicator */}
      {isDirty && <DirtyIndicator />}

      {/* Additional toolbar items */}
      {children && (
        <>
          <ToolbarDivider />
          {children}
        </>
      )}
    </div>
  );
}

/**
 * Individual toolbar button
 */
interface ToolbarButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
  children: React.ReactNode;
  className?: string;
}

export function ToolbarButton({
  onClick,
  disabled = false,
  title,
  'aria-label': ariaLabel,
  children,
  className,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={clsx(
        'p-1.5 rounded transition-colors',
        'hover:bg-neutral-100 dark:hover:bg-neutral-700',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
        'text-neutral-600 dark:text-neutral-400',
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * Dirty state indicator badge
 */
export function DirtyIndicator({ label = 'Unsaved' }: { label?: string }) {
  return (
    <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-medium">
      {label}
    </span>
  );
}

/**
 * Toolbar divider
 */
export function ToolbarDivider() {
  return (
    <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-1" />
  );
}

/**
 * Toolbar group wrapper
 */
export function ToolbarGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex items-center gap-1', className)}>
      {children}
    </div>
  );
}
