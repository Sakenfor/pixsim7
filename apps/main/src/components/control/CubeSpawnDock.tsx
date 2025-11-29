import { useCallback } from 'react';
import { useControlCubeStore, type CubeType } from '@/stores/controlCubeStore';
import { useControlCenterStore } from '@/stores/controlCenterStore';
import { BASE_CUBE_SIZE } from '../../config/cubeConstants';
import { clsx } from 'clsx';

/**
 * Lightweight dock for spawning standalone cubes.
 * Uses the shared control cube store; spawned cubes are
 * rendered by the CubeFormationControlCenter as standalone cubes.
 */
export function CubeSpawnDock() {
  const addCube = useControlCubeStore((s) => s.addCube);
  const setOpen = useControlCenterStore((s) => s.setOpen);

  const spawnCube = useCallback(
    (type: CubeType) => {
      // Ensure control center is visible so the new cube can be seen
      setOpen(true);

      const margin = 120;
      const x =
        window.innerWidth - margin - BASE_CUBE_SIZE +
        Math.random() * 40 - 20;
      const y =
        window.innerHeight - margin - BASE_CUBE_SIZE +
        Math.random() * 40 - 20;

      addCube(type, { x, y });
    },
    [addCube, setOpen]
  );

  return (
    <div
      className={clsx(
        'fixed bottom-20 right-4 z-40 pointer-events-auto',
        'bg-black/70 backdrop-blur-md rounded-lg border border-white/15',
        'px-3 py-2 text-xs text-white shadow-lg space-y-2'
      )}
    >
      <div className="font-semibold text-[11px] tracking-wide text-white/80">
        Cubes
      </div>
      <div className="flex flex-wrap gap-1.5 max-w-[9rem]">
        <button
          type="button"
          onClick={() => spawnCube('control')}
          className="px-2 py-1 rounded bg-blue-600/80 hover:bg-blue-500 text-[11px]"
        >
          Control
        </button>
        <button
          type="button"
          onClick={() => spawnCube('provider')}
          className="px-2 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-[11px]"
        >
          Provider
        </button>
        <button
          type="button"
          onClick={() => spawnCube('preset')}
          className="px-2 py-1 rounded bg-orange-600/80 hover:bg-orange-500 text-[11px]"
        >
          Preset
        </button>
        <button
          type="button"
          onClick={() => spawnCube('panel')}
          className="px-2 py-1 rounded bg-cyan-600/80 hover:bg-cyan-500 text-[11px]"
        >
          Panel
        </button>
        <button
          type="button"
          onClick={() => spawnCube('settings')}
          className="px-2 py-1 rounded bg-slate-600/80 hover:bg-slate-500 text-[11px]"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={() => spawnCube('gallery')}
          className="px-2 py-1 rounded bg-pink-600/80 hover:bg-pink-500 text-[11px]"
        >
          Gallery
        </button>
      </div>
      <div className="text-[10px] text-white/50 pt-1 border-t border-white/10 mt-1">
        New cubes appear near bottom-right.
      </div>
    </div>
  );
}
