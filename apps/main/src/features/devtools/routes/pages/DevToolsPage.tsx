import { DevToolsPanel } from '@features/panels/components/dev/DevToolsPanel';

/**
 * Full-page view of the DevTools catalog.
 *
 * Hosted at /dev-tools. Reuses the same DevToolsPanel component that also
 * renders inside a floating/docked workspace panel.
 */
export function DevToolsPage() {
  return (
    <div className="h-screen flex flex-col bg-neutral-100 dark:bg-neutral-950">
      <div className="flex-1 min-h-0">
        <DevToolsPanel />
      </div>
    </div>
  );
}
