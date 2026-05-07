/**
 * Editor Shell Component
 *
 * Main layout wrapper for graph-based editors. Provides a consistent
 * structure with optional sidebar, toolbar, and header areas.
 */

import { useState, useRef } from 'react';
import { clsx } from 'clsx';
import { ResizeDivider, useResizeHandle } from '@pixsim7/shared.ui';
import { EditorToolbar } from './EditorToolbar';
import type { EditorShellProps, EditorShellLayout } from '../types';

// ============================================================================
// Default Layout
// ============================================================================

const defaultLayout: Required<EditorShellLayout> = {
  showSidebar: true,
  sidebarWidth: 320,
  sidebarPosition: 'right',
  resizableSidebar: true,
  showToolbar: true,
  toolbarPosition: 'top',
};

// ============================================================================
// Main Component
// ============================================================================

/**
 * Standard editor shell layout with optional sidebar and toolbar
 *
 * @example
 * ```tsx
 * <EditorShell
 *   sidebar={<NodeInspector />}
 *   header={<GraphSelector />}
 *   onUndo={undo}
 *   onRedo={redo}
 *   canUndo={canUndo}
 *   canRedo={canRedo}
 *   isDirty={isDirty}
 * >
 *   <GraphSurface />
 * </EditorShell>
 * ```
 */
export function EditorShell({
  children,
  sidebar,
  toolbarItems,
  header,
  layout: layoutOverrides = {},
  isDirty = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  className,
}: EditorShellProps) {
  const layout = { ...defaultLayout, ...layoutOverrides };

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(layout.sidebarWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isDragging: isResizing, handleMouseDown: handleResizeStart } = useResizeHandle({
    orientation: 'vertical',
    onResize: ({ position }) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const raw = layout.sidebarPosition === 'right'
        ? rect.right - position
        : position - rect.left;
      setSidebarWidth(Math.max(200, Math.min(600, raw)));
    },
  });

  // Build layout classes
  const showSidebar = layout.showSidebar && sidebar;

  return (
    <div
      ref={containerRef}
      className={clsx(
        'h-full w-full flex flex-col overflow-hidden',
        'bg-neutral-50 dark:bg-neutral-900',
        className
      )}
    >
      {/* Header area (e.g., graph selector) */}
      {header && (
        <div className="flex-none border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2">
          {header}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        {showSidebar && layout.sidebarPosition === 'left' && (
          <>
            <SidebarPanel
              width={sidebarWidth}
              position="left"
              showToolbar={layout.showToolbar}
              isDirty={isDirty}
              onUndo={onUndo}
              onRedo={onRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              toolbarItems={toolbarItems}
            >
              {sidebar}
            </SidebarPanel>
            {layout.resizableSidebar && (
              <ResizeDivider
                orientation="vertical"
                onMouseDown={handleResizeStart}
                isDragging={isResizing}
              />
            )}
          </>
        )}

        {/* Main content (graph surface) */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>

        {/* Right sidebar */}
        {showSidebar && layout.sidebarPosition === 'right' && (
          <>
            {layout.resizableSidebar && (
              <ResizeDivider
                orientation="vertical"
                onMouseDown={handleResizeStart}
                isDragging={isResizing}
              />
            )}
            <SidebarPanel
              width={sidebarWidth}
              position="right"
              showToolbar={layout.showToolbar}
              isDirty={isDirty}
              onUndo={onUndo}
              onRedo={onRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              toolbarItems={toolbarItems}
            >
              {sidebar}
            </SidebarPanel>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface SidebarPanelProps {
  children: React.ReactNode;
  width: number;
  position: 'left' | 'right';
  showToolbar?: boolean;
  isDirty?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  toolbarItems?: React.ReactNode;
}

function SidebarPanel({
  children,
  width,
  position,
  showToolbar,
  isDirty,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  toolbarItems,
}: SidebarPanelProps) {
  return (
    <div
      className={clsx(
        'flex-none flex flex-col bg-white dark:bg-neutral-800',
        position === 'left' && 'border-r border-neutral-200 dark:border-neutral-700',
        position === 'right' && 'border-l border-neutral-200 dark:border-neutral-700'
      )}
      style={{ width }}
    >
      {/* Toolbar header */}
      {showToolbar && (
        <div className="flex-none px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
          <EditorToolbar
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            isDirty={isDirty}
          >
            {toolbarItems}
          </EditorToolbar>
        </div>
      )}

      {/* Sidebar content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Utility Components
// ============================================================================

/**
 * Empty state component for when no graph is selected
 */
export function EditorEmptyState({
  title = 'No graph selected',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center p-6 bg-white dark:bg-neutral-800 rounded-lg shadow-lg max-w-sm">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          {title}
        </p>
        {description && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
            {description}
          </p>
        )}
        {action}
      </div>
    </div>
  );
}

/**
 * Section header for sidebar panels
 */
export function SidebarSection({
  title,
  children,
  className,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={clsx('px-3 py-2', className)}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </div>
  );
}

/**
 * Form field for property inspector
 */
export function PropertyField({
  label,
  children,
  description,
}: {
  label: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {label}
      </label>
      {children}
      {description && (
        <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      )}
    </div>
  );
}
