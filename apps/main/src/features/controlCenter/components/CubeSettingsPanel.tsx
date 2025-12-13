import { useMemo, useState } from 'react';
import { useControlCubeStore, type CubeType } from '@features/controlCenter/stores/controlCubeStore';
import { useCubeSettingsStore, type LinkingGesture } from '@features/controlCenter/stores/cubeSettingsStore';
import { panelActionRegistry } from '@lib/ui/panels';
import { Button } from '@pixsim7/shared.ui';

type CubeSettingsTab = 'cubes' | 'actions' | 'input';

export function CubeSettingsPanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<CubeSettingsTab>('cubes');

  const cubes = useControlCubeStore((s) => s.cubes);
  const activeCubeId = useControlCubeStore((s) => s.activeCubeId);
  const setActiveCube = useControlCubeStore((s) => s.setActiveCube);
  const updateCube = useControlCubeStore((s) => s.updateCube);
  const removeCube = useControlCubeStore((s) => s.removeCube);
  const summonCubes = useControlCubeStore((s) => s.summonCubes);
  const dismissCubes = useControlCubeStore((s) => s.dismissCubes);
  const reset = useControlCubeStore((s) => s.reset);

  const linkingGesture = useCubeSettingsStore((s) => s.linkingGesture);
  const setLinkingGesture = useCubeSettingsStore((s) => s.setLinkingGesture);

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

  const panels = useMemo(
    () =>
      panelActionRegistry.getAllPanels().map((panelId) => ({
        id: panelId,
        config: panelActionRegistry.getConfig(panelId),
        mappings: panelActionRegistry.getFaceMappings(panelId),
      })),
    []
  );

  const renderCubesTab = () => (
    <>
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
    </>
  );

  const renderActionsTab = () => (
    <div className="flex-1 overflow-auto">
      {panels.length === 0 ? (
        <div className="px-3 py-4 text-white/50 text-center">
          No panel actions registered yet.
        </div>
      ) : (
        <div className="px-3 py-2 space-y-3">
          {panels.map(({ id, config, mappings }) => (
            <div key={id} className="border border-white/15 rounded-md p-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-semibold">
                  {config?.panelName || id}
                </div>
                <div className="text-[10px] text-white/50">{id}</div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                {(Object.keys(mappings) as (keyof typeof mappings)[]).map((face) => {
                  const action = mappings[face];
                  return (
                    <div
                      key={face}
                      className="border border-white/15 rounded px-1.5 py-1 bg-white/5"
                    >
                      <div className="font-mono text-[9px] text-white/60 mb-0.5">
                        {face}
                      </div>
                      {action ? (
                        <div className="flex flex-col">
                          <span className="truncate">{action.label}</span>
                          {action.shortcut && (
                            <span className="text-white/40 text-[9px]">
                              {action.shortcut}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-white/40 italic">Unassigned</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderInputTab = () => (
    <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
      <div>
        <div className="text-[11px] font-semibold mb-1">Linking Gesture</div>
        <div className="text-[10px] text-white/60 mb-1">
          Choose how to create connections between cube faces.
        </div>
        <select
          value={linkingGesture}
          onChange={(e) => setLinkingGesture(e.target.value as LinkingGesture)}
          className="w-full bg-black/40 border border-white/25 rounded px-1.5 py-1 text-[11px]"
        >
          <option value="middleClick">Middle-click face to connect</option>
          <option value="shiftLeftClick">Shift + Left-click face to connect</option>
        </select>
        <div className="mt-1 text-[10px] text-white/50">
          Tip: Middle-click avoids conflicts with dragging; Shift+Left-click works on
          trackpads without a middle button.
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed bottom-20 right-4 z-[9999] w-96 max-h-[70vh] bg-black/85 text-white text-xs rounded-lg border border-white/20 shadow-2xl backdrop-blur-md flex flex-col">
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
        <div className="font-semibold text-[11px] tracking-wide">Cube Settings</div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-white/60 hover:text-white"
        >
          Close
        </button>
      </div>
      <div className="px-3 pt-2 flex gap-1 border-b border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab('cubes')}
          className={`px-2 py-1 rounded-t text-[10px] border-b-2 ${
            activeTab === 'cubes'
              ? 'border-blue-400 text-white'
              : 'border-transparent text-white/60 hover:text-white'
          }`}
        >
          Cubes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('actions')}
          className={`px-2 py-1 rounded-t text-[10px] border-b-2 ${
            activeTab === 'actions'
              ? 'border-blue-400 text-white'
              : 'border-transparent text-white/60 hover:text-white'
          }`}
        >
          Actions
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('input')}
          className={`px-2 py-1 rounded-t text-[10px] border-b-2 ${
            activeTab === 'input'
              ? 'border-blue-400 text-white'
              : 'border-transparent text-white/60 hover:text-white'
          }`}
        >
          Input
        </button>
      </div>
      {activeTab === 'cubes' && renderCubesTab()}
      {activeTab === 'actions' && renderActionsTab()}
      {activeTab === 'input' && renderInputTab()}
    </div>
  );
}

