/**
 * Panel-side mount of the diagnostics surface.
 *
 * Reuses the same ``DiagnosticsView`` body that powers the full-page
 * route at /dev/testing/diagnostics — so any change to the view shape
 * lands in both surfaces simultaneously.
 *
 * Wraps in an ``h-full`` container so the view fills the dock pane;
 * scroll-on-overflow lives inside the view itself.
 */
import { DiagnosticsView } from '@features/devtools/routes/pages/DiagnosticsPage';

export function TestingDiagnosticsPanel() {
  return (
    <div className="h-full w-full">
      <DiagnosticsView />
    </div>
  );
}
