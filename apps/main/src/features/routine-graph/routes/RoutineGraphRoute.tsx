/**
 * Routine Graph Route
 *
 * Page component for the routine graph editor.
 */

import { RoutineGraphPanel } from '../components/RoutineGraphPanel';

export function RoutineGraphRoute() {
  return (
    <div className="h-full w-full">
      <RoutineGraphPanel />
    </div>
  );
}

export default RoutineGraphRoute;
