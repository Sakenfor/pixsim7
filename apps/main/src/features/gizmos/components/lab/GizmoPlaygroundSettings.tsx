/**
 * Gizmo Playground Settings
 *
 * Settings section for the gizmo-playground panel definition.
 * Renders a detector selector dropdown.
 */

import { useMemo } from 'react';

import { zoneDetectorRegistry } from '@lib/detection';

import { useGizmoLabStore } from '../../stores/gizmoLabStore';

export function GizmoPlaygroundSettings() {
  const activeDetectorId = useGizmoLabStore((s) => s.activeDetectorId);
  const setDetectorId = useGizmoLabStore((s) => s.setDetectorId);

  const detectors = useMemo(() => zoneDetectorRegistry.list(), []);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
          Zone Detector
        </label>
        <select
          value={activeDetectorId}
          onChange={(e) => setDetectorId(e.target.value)}
          className="w-full text-sm bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1.5"
        >
          {detectors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {detectors.find((d) => d.id === activeDetectorId) && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {detectors.find((d) => d.id === activeDetectorId)!.description}
        </p>
      )}
    </div>
  );
}
