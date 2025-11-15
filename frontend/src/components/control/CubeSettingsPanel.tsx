import { useMemo } from 'react';
import { useControlCubeStore, type CubeType } from '../../stores/controlCubeStore';
import { Button } from '@pixsim7/ui';

export function CubeSettingsPanel({ onClose }: { onClose: () => void }) {
  const cubes = useControlCubeStore((s) => s.cubes);
  const activeCubeId = useControlCubeStore((s) => s.activeCubeId);
  const setActiveCube = useControlCubeStore((s) => s.setActiveCube);
  const updateCube = useControlCubeStore((s) => s.updateCube);
  const removeCube = useControlCubeStore((s) => s.removeCube);
  const summonCubes = useControlCubeStore((s) => s.summonCubes);
  const dismissCubes = useControlCubeStore((s) => s.dismissCubes);
  const reset = useControlCubeStore((s) => s.reset);

  const cubeList = useMemo(
    () => Object.values(cubes).sort((a, b) => a.zIndex - b.zIndex),
    [cubes]
  );

  const handleToggleVisibility = (id: string) => {
    const cube = cubes[id];
    if (!cube) return;
    updateCube(id, { visible: !cube.visible });
  };

  const handleChangeType = (id: string, type: CubeType) => {
    updateCube(id, { type });
  };

  return (
    <div className="fixed bottom-20 right-4 z-[9999] w-80 max-h-[60vh] bg-black/85 text-white text-xs rounded-lg border border-white/20 shadow-2xl backdrop-blur-md flex flex-col">
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
        <div className="font-semibold text-[11px] tracking-wide">Cubes Overview</div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-white/60 hover:text-white"
        >
          Close
        </button>
      </div>
      <div className="px-3 py-2 flex gap-2 border-b border-white/10">
        <Button size="xs" variant="secondary" onClick={summonCubes}>
          Summon
        </Button>
        <Button size="xs" variant="secondary" onClick={dismissCubes}>
          Dismiss
        </Button>
        <Button
          size="xs"
          variant="secondary"
          className="ml-auto"
          onClick={reset}
        >
          Reset Cubes
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {cubeList.length === 0 ? (
          <div className="px-3 py-4 text-white/50 text-center">No cubes yet.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {cubeList.map((cube) => (
              <div key={cube.id} className="px-3 py-2 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveCube(cube.id)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                      activeCubeId === cube.id
                        ? 'bg-blue-600/70 border-blue-400'
                        : 'bg-white/10 border-white/25'
                    }`}
                    title="Set active cube"
                  >
                    {cube.id}
                  </button>
                  <select
                    value={cube.type}
                    onChange={(e) =>
                      handleChangeType(cube.id, e.target.value as CubeType)
                    }
                    className="bg-black/40 border border-white/25 rounded px-1.5 py-0.5 text-[10px]"
                  >
                    <option value="control">control</option>
                    <option value="provider">provider</option>
                    <option value="preset">preset</option>
                    <option value="panel">panel</option>
                    <option value="settings">settings</option>
                    <option value="gallery">gallery</option>
                  </select>
                  <span className="ml-auto text-[10px] text-white/50">
                    z:{cube.zIndex}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-white/70">
                  <div className="flex flex-col gap-0.5">
                    <span>
                      pos: {Math.round(cube.position.x)},{' '}
                      {Math.round(cube.position.y)}
                    </span>
                    <span>
                      mode: {cube.mode}
                      {cube.dockedToPanelId && ` · docked:${cube.dockedToPanelId}`}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(cube.id)}
                      className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px]"
                    >
                      {cube.visible ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCube(cube.id)}
                      className="px-1.5 py-0.5 rounded bg-red-600/80 hover:bg-red-500 text-[10px]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

