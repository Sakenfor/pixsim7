import { useEffect, useState } from 'react';
import { Button, Panel, Input, Badge } from '@pixsim7/shared.ui';
import {
  listGameNpcs,
  getNpcExpressions,
  saveNpcExpressions,
  getNpcDetail,
  saveNpcMeta,
  type GameNpcSummary,
  type GameNpcDetail,
  type NpcExpressionDTO,
} from '../lib/api/game';
import { NpcPreferencesEditor } from '../components/NpcPreferencesEditor';
import { useWorkspaceStore } from '../stores/workspaceStore';

type TabType = 'expressions' | 'preferences';

export function NpcPortraits() {
  const [npcs, setNpcs] = useState<GameNpcSummary[]>([]);
  const [selectedNpcId, setSelectedNpcId] = useState<number | null>(null);
  const [selectedNpc, setSelectedNpc] = useState<GameNpcDetail | null>(null);
  const [expressions, setExpressions] = useState<NpcExpressionDTO[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('expressions');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  useEffect(() => {
    (async () => {
      try {
        const list = await listGameNpcs();
        setNpcs(list);
        if (!selectedNpcId && list.length > 0) {
          setSelectedNpcId(list[0].id);
        }
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedNpcId) {
      setExpressions([]);
      setSelectedNpc(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        // Load expressions
        const rows = await getNpcExpressions(selectedNpcId);
        setExpressions(rows);

        // Load NPC detail for preferences
        const npcDetail = await getNpcDetail(selectedNpcId);
        setSelectedNpc(npcDetail);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [selectedNpcId]);

  const handleChange = (idx: number, patch: Partial<NpcExpressionDTO>) => {
    setExpressions((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  };

  const addExpression = () => {
    setExpressions((prev) => [
      ...prev,
      { state: 'idle', asset_id: 0, crop: undefined, meta: {} },
    ]);
  };

  const handleSave = async () => {
    if (!selectedNpcId) return;
    setIsLoading(true);
    setError(null);
    try {
      const cleaned = expressions.filter((e) => e.state && e.asset_id);
      const saved = await saveNpcExpressions(selectedNpcId, cleaned);
      setExpressions(saved);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleNpcChange = (updated: GameNpcDetail) => {
    setSelectedNpc(updated);
  };

  const handleSavePreferences = async () => {
    if (!selectedNpcId || !selectedNpc) return;
    setIsLoading(true);
    setError(null);
    try {
      const saved = await saveNpcMeta(selectedNpcId, selectedNpc.meta || {});
      setSelectedNpc(saved);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">NPC Configuration</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Configure NPC portraits, expressions, and interaction preferences.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => selectedNpcId && openFloatingPanel('npc-brain-lab', { context: { npcId: selectedNpcId } })}
            disabled={!selectedNpcId}
            title="Open NPC Brain Lab to inspect brain state"
          >
            🧠 Open Brain Lab
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={activeTab === 'expressions' ? handleSave : handleSavePreferences}
            disabled={!selectedNpcId || isLoading}
          >
            {isLoading ? 'Saving…' : activeTab === 'expressions' ? 'Save Expressions' : 'Save Preferences'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">Error: {error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="space-y-3">
          <h2 className="text-sm font-semibold">NPCs</h2>
          {npcs.length === 0 && (
            <p className="text-xs text-neutral-500">No NPCs defined yet.</p>
          )}
          <div className="space-y-1">
            {npcs.map((npc) => (
              <button
                key={npc.id}
                className={`w-full text-left px-2 py-1 rounded text-xs border ${
                  selectedNpcId === npc.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200'
                }`}
                onClick={() => setSelectedNpcId(npc.id)}
              >
                <span className="font-medium">{npc.name}</span>
                <span className="ml-2 text-[10px] text-neutral-400">id {npc.id}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="space-y-3 lg:col-span-2">
          {/* Tab Navigation */}
          {selectedNpcId && (
            <div className="flex border-b border-neutral-200 dark:border-neutral-700 mb-4">
              <button
                onClick={() => setActiveTab('expressions')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'expressions'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                Expressions
              </button>
              <button
                onClick={() => setActiveTab('preferences')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'preferences'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                Preferences
              </button>
            </div>
          )}

          {/* Expressions Tab */}
          {activeTab === 'expressions' && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Expressions</h2>
                <Button size="sm" variant="secondary" onClick={addExpression} disabled={!selectedNpcId}>
                  Add Expression
                </Button>
              </div>
              {!selectedNpcId && (
                <p className="text-xs text-neutral-500">Select an NPC to edit expressions.</p>
              )}
              {selectedNpcId && (
                <div className="space-y-2">
                  {expressions.length === 0 && (
                    <p className="text-xs text-neutral-500">
                      No expressions yet. Add one and specify state and asset_id.
                    </p>
                  )}
                  {expressions.map((expr, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 items-center text-xs">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500">State</span>
                    <Input
                      placeholder="idle / talking / bored ..."
                      value={expr.state}
                      onChange={(e: any) => handleChange(idx, { state: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500">Asset ID</span>
                    <Input
                      placeholder="asset_id"
                      value={expr.asset_id || ''}
                      onChange={(e: any) => {
                        const v = e.target.value.trim();
                        handleChange(idx, { asset_id: v ? Number(v) : 0 });
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500">Crop JSON</span>
                    <Input
                      placeholder='{"x":0.2,"y":0.1,"w":0.6,"h":0.8}'
                      value={expr.crop ? JSON.stringify(expr.crop) : ''}
                      onChange={(e: any) => {
                        const v = e.target.value.trim();
                        let crop: Record<string, unknown> | undefined;
                        if (v) {
                          try {
                            crop = JSON.parse(v);
                          } catch {
                            crop = expr.crop ?? undefined;
                          }
                        }
                        handleChange(idx, { crop });
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500">Meta JSON</span>
                    <Input
                      placeholder="optional meta"
                      value={expr.meta ? JSON.stringify(expr.meta) : ''}
                      onChange={(e: any) => {
                        const v = e.target.value.trim();
                        let meta: Record<string, unknown> | undefined;
                        if (v) {
                          try {
                            meta = JSON.parse(v);
                          } catch {
                            meta = expr.meta ?? undefined;
                          }
                        }
                        handleChange(idx, { meta });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
            </>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && selectedNpc && (
            <NpcPreferencesEditor npc={selectedNpc} onChange={handleNpcChange} />
          )}

          {/* No NPC selected message */}
          {!selectedNpcId && (
            <p className="text-xs text-neutral-500">Select an NPC to edit configuration.</p>
          )}
        </Panel>
      </div>

      <div className="pt-4 text-xs text-neutral-500 dark:text-neutral-400">
        <p>
          Use this mapping to drive NPC portraits in both 2D and 3D UIs. A future asset picker
          can enhance this by allowing visual selection instead of manual asset_id entry.
        </p>
      </div>
    </div>
  );
}

