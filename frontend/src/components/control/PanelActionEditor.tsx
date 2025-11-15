import { useState, useCallback } from 'react';
import type { CubeFace } from '../../stores/controlCubeStore';
import type { PanelAction, PanelActionsConfig } from '../../lib/panelActions';
import { useToast } from '../../stores/toastStore';
import { clsx } from 'clsx';

interface EditingAction extends PanelAction {
  face?: CubeFace;
}

export interface PanelActionEditorProps {
  onSave?: (config: PanelActionsConfig) => void;
  onClose?: () => void;
  initialConfig?: Partial<PanelActionsConfig>;
}

const DEFAULT_ICONS = [
  '⚡', '🎨', '🔍', '📊', '⚙️', '🎮', '📁', '🗑️', '⬆️', '⬇️',
  '➕', '✂️', '📋', '💾', '🔄', '✨', '🎯', '🔧', '📝', '🎭',
  '🌐', '📡', '🔌', '🔑', '💡', '🎬', '📐', '🔲', '▶️', '⏸️',
];

export function PanelActionEditor({
  onSave,
  onClose,
  initialConfig,
}: PanelActionEditorProps) {
  const [panelId, setPanelId] = useState(initialConfig?.panelId || '');
  const [panelName, setPanelName] = useState(initialConfig?.panelName || '');
  const [actions, setActions] = useState<EditingAction[]>(initialConfig?.actions || []);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [selectedFace, setSelectedFace] = useState<CubeFace | null>(null);
  const [previewRotation, setPreviewRotation] = useState({ x: -20, y: 20, z: 0 });
  const toast = useToast();

  const selectedAction = actions.find((a) => a.id === selectedActionId);

  const handleAddAction = useCallback(() => {
    const newAction: EditingAction = {
      id: `action-${Date.now()}`,
      label: 'New Action',
      icon: '⚡',
      execute: () => {
        // Action execution placeholder
      },
    };
    setActions([...actions, newAction]);
    setSelectedActionId(newAction.id);
  }, [actions]);

  const handleDeleteAction = useCallback((actionId: string) => {
    setActions(actions.filter((a) => a.id !== actionId));
    if (selectedActionId === actionId) {
      setSelectedActionId(null);
    }
  }, [actions, selectedActionId]);

  const handleUpdateAction = useCallback((
    actionId: string,
    updates: Partial<EditingAction>
  ) => {
    setActions(
      actions.map((a) => (a.id === actionId ? { ...a, ...updates } : a))
    );
  }, [actions]);

  const handleAssignToFace = useCallback((actionId: string, face: CubeFace) => {
    // Remove face from other actions
    const updatedActions = actions.map((a) => ({
      ...a,
      face: a.face === face ? undefined : a.face,
    }));

    // Assign face to selected action
    const finalActions = updatedActions.map((a) =>
      a.id === actionId ? { ...a, face } : a
    );

    setActions(finalActions);
    setSelectedFace(null);
  }, [actions]);

  const handleSave = useCallback(() => {
    if (!panelId || !panelName) {
      toast.error('Please provide panel ID and name');
      return;
    }

    const config: PanelActionsConfig = {
      panelId,
      panelName,
      actions: actions.map(({ face, ...action }) => action),
      defaultFaces: actions.reduce((acc, action) => {
        if (action.face) {
          acc[action.face] = action.id;
        }
        return acc;
      }, {} as Partial<Record<CubeFace, string>>),
    };

    onSave?.(config);
  }, [panelId, panelName, actions, onSave, toast]);

  const generateCode = useCallback(() => {
    const actionsCode = actions
      .map((action) => {
        const parts = [
          `    {`,
          `      id: '${action.id}',`,
          `      label: '${action.label}',`,
          `      icon: '${action.icon}',`,
        ];

        if (action.description) {
          parts.push(`      description: '${action.description}',`);
        }
        if (action.face) {
          parts.push(`      face: '${action.face}',`);
        }
        if (action.shortcut) {
          parts.push(`      shortcut: '${action.shortcut}',`);
        }

        parts.push(`      execute: () => {`);
        parts.push(`        // TODO: Implement action for ${action.label}`);
        parts.push(`      },`);
        parts.push(`    }`);

        return parts.join('\n');
      })
      .join(',\n');

    return `import { useRegisterPanelActions } from '@/hooks/useRegisterPanelActions';

function ${panelName.replace(/\s+/g, '')}() {
  useRegisterPanelActions({
    panelId: '${panelId}',
    panelName: '${panelName}',
    actions: [
${actionsCode}
    ],
  });

  return (
    <div data-panel-id="${panelId}">
      {/* Your panel content */}
    </div>
  );
}`;
  }, [panelId, panelName, actions]);

  const copyCode = useCallback(() => {
    const code = generateCode();
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard!');
  }, [generateCode, toast]);

  // Generate preview faces
  const previewFaces = actions.reduce((acc, action) => {
    if (action.face) {
      acc[action.face] = (
        <div className="text-sm flex flex-col items-center gap-1">
          <div className="text-2xl">{action.icon}</div>
          <div className="text-[10px] text-white/90 font-medium">{action.label}</div>
        </div>
      );
    }
    return acc;
  }, {} as Record<CubeFace, React.ReactNode>);

  // Helper to render a cube face
  const renderCubeFace = (
    content: React.ReactNode | undefined,
    transform: string,
    face: CubeFace
  ) => {
    const assignedAction = actions.find((a) => a.face === face);
    return (
      <div
        className={clsx(
          'absolute flex items-center justify-center border backdrop-blur-md transition-all duration-300',
          assignedAction
            ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-blue-400/50'
            : 'bg-gradient-to-br from-white/5 to-white/10 border-white/20'
        )}
        style={{
          width: '150px',
          height: '150px',
          transform,
        }}
      >
        {content || (
          <div className="text-white/40 text-xs">{face}</div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
      <div className="bg-neutral-900 rounded-xl border border-white/20 shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">Panel Action Editor</h2>
            <span className="text-sm text-white/60">Design cube actions visually</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
          >
            Close
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left: Preview */}
          <div className="w-1/3 flex flex-col gap-4">
            <div className="bg-neutral-800 rounded-lg p-4 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-2">Panel Info</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-white/60 block mb-1">Panel ID</label>
                  <input
                    type="text"
                    value={panelId}
                    onChange={(e) => setPanelId(e.target.value)}
                    placeholder="e.g., gallery"
                    className="w-full px-3 py-1.5 rounded bg-black/50 text-white text-sm border border-white/10 focus:border-blue-400 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60 block mb-1">Panel Name</label>
                  <input
                    type="text"
                    value={panelName}
                    onChange={(e) => setPanelName(e.target.value)}
                    placeholder="e.g., Gallery"
                    className="w-full px-3 py-1.5 rounded bg-black/50 text-white text-sm border border-white/10 focus:border-blue-400 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="bg-neutral-800 rounded-lg p-4 border border-white/10 flex-1 flex flex-col items-center justify-center">
              <h3 className="text-sm font-semibold text-white mb-4">Cube Preview</h3>
              <div
                className="relative"
                style={{
                  width: '150px',
                  height: '150px',
                  perspective: '1000px',
                }}
              >
                <div
                  className="relative w-full h-full"
                  style={{
                    transform: `rotateX(${previewRotation.x}deg) rotateY(${previewRotation.y}deg) rotateZ(${previewRotation.z}deg)`,
                    transformStyle: 'preserve-3d',
                    transition: 'transform 0.5s',
                  }}
                >
                  {/* Simple 3D cube preview */}
                  {renderCubeFace(previewFaces.front, `translateZ(75px)`, 'front')}
                  {renderCubeFace(previewFaces.back, `rotateY(180deg) translateZ(75px)`, 'back')}
                  {renderCubeFace(previewFaces.right, `rotateY(90deg) translateZ(75px)`, 'right')}
                  {renderCubeFace(previewFaces.left, `rotateY(-90deg) translateZ(75px)`, 'left')}
                  {renderCubeFace(previewFaces.top, `rotateX(90deg) translateZ(75px)`, 'top')}
                  {renderCubeFace(previewFaces.bottom, `rotateX(-90deg) translateZ(75px)`, 'bottom')}
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setPreviewRotation({ x: 0, y: 0, z: 0 })}
                  className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded text-white"
                >
                  Front
                </button>
                <button
                  onClick={() => setPreviewRotation({ x: 0, y: 90, z: 0 })}
                  className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded text-white"
                >
                  Right
                </button>
                <button
                  onClick={() => setPreviewRotation({ x: -90, y: 0, z: 0 })}
                  className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded text-white"
                >
                  Top
                </button>
              </div>
            </div>
          </div>

          {/* Middle: Actions List */}
          <div className="w-1/3 flex flex-col gap-4">
            <div className="bg-neutral-800 rounded-lg p-4 border border-white/10 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Actions</h3>
                <button
                  onClick={handleAddAction}
                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white"
                >
                  + Add
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className={clsx(
                      'p-3 rounded border cursor-pointer transition-colors',
                      selectedActionId === action.id
                        ? 'bg-blue-600/20 border-blue-400'
                        : 'bg-black/30 border-white/10 hover:border-white/30'
                    )}
                    onClick={() => setSelectedActionId(action.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{action.icon}</span>
                        <span className="text-sm text-white font-medium">
                          {action.label}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAction(action.id);
                        }}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        🗑️
                      </button>
                    </div>
                    {action.face && (
                      <div className="text-xs text-white/60">
                        Assigned to: {action.face}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-neutral-800 rounded-lg p-3 border border-white/10">
              <h3 className="text-xs font-semibold text-white mb-2">Assign to Face</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['front', 'back', 'left', 'right', 'top', 'bottom'] as CubeFace[]).map(
                  (face) => {
                    const assignedAction = actions.find((a) => a.face === face);
                    return (
                      <button
                        key={face}
                        onClick={() => {
                          if (selectedActionId) {
                            handleAssignToFace(selectedActionId, face);
                          }
                        }}
                        disabled={!selectedActionId}
                        className={clsx(
                          'px-2 py-1.5 rounded text-xs transition-colors',
                          assignedAction
                            ? 'bg-green-600/30 border border-green-400 text-white'
                            : selectedActionId
                            ? 'bg-white/10 hover:bg-white/20 border border-white/20 text-white'
                            : 'bg-white/5 border border-white/5 text-white/30 cursor-not-allowed'
                        )}
                      >
                        {face}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>

          {/* Right: Action Editor */}
          <div className="w-1/3 flex flex-col gap-4">
            {selectedAction ? (
              <>
                <div className="bg-neutral-800 rounded-lg p-4 border border-white/10 flex-1 overflow-y-auto">
                  <h3 className="text-sm font-semibold text-white mb-4">
                    Edit Action
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-white/60 block mb-1">Label</label>
                      <input
                        type="text"
                        value={selectedAction.label}
                        onChange={(e) =>
                          handleUpdateAction(selectedAction.id, {
                            label: e.target.value,
                          })
                        }
                        className="w-full px-3 py-1.5 rounded bg-black/50 text-white text-sm border border-white/10 focus:border-blue-400 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-white/60 block mb-1">Icon</label>
                      <div className="grid grid-cols-5 gap-2 mb-2">
                        {DEFAULT_ICONS.map((icon) => (
                          <button
                            key={icon}
                            onClick={() =>
                              handleUpdateAction(selectedAction.id, { icon })
                            }
                            className={clsx(
                              'text-2xl p-2 rounded border transition-colors',
                              selectedAction.icon === icon
                                ? 'bg-blue-600/30 border-blue-400'
                                : 'bg-black/30 border-white/10 hover:border-white/30'
                            )}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={selectedAction.icon}
                        onChange={(e) =>
                          handleUpdateAction(selectedAction.id, {
                            icon: e.target.value,
                          })
                        }
                        placeholder="Custom emoji"
                        className="w-full px-3 py-1.5 rounded bg-black/50 text-white text-sm border border-white/10 focus:border-blue-400 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-white/60 block mb-1">
                        Description
                      </label>
                      <textarea
                        value={selectedAction.description || ''}
                        onChange={(e) =>
                          handleUpdateAction(selectedAction.id, {
                            description: e.target.value,
                          })
                        }
                        rows={3}
                        className="w-full px-3 py-1.5 rounded bg-black/50 text-white text-sm border border-white/10 focus:border-blue-400 outline-none resize-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-white/60 block mb-1">
                        Keyboard Shortcut
                      </label>
                      <input
                        type="text"
                        value={selectedAction.shortcut || ''}
                        onChange={(e) =>
                          handleUpdateAction(selectedAction.id, {
                            shortcut: e.target.value,
                          })
                        }
                        placeholder="e.g., Ctrl+S"
                        className="w-full px-3 py-1.5 rounded bg-black/50 text-white text-sm border border-white/10 focus:border-blue-400 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-white/60 block mb-1">
                        Action ID
                      </label>
                      <input
                        type="text"
                        value={selectedAction.id}
                        onChange={(e) =>
                          handleUpdateAction(selectedAction.id, {
                            id: e.target.value,
                          })
                        }
                        className="w-full px-3 py-1.5 rounded bg-black/50 text-white text-sm border border-white/10 focus:border-blue-400 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-neutral-800 rounded-lg p-4 border border-white/10 flex-1 flex items-center justify-center">
                <p className="text-white/60 text-sm">
                  Select an action to edit
                </p>
              </div>
            )}

            <div className="bg-neutral-800 rounded-lg p-4 border border-white/10">
              <h3 className="text-xs font-semibold text-white mb-2">Export</h3>
              <div className="flex gap-2">
                <button
                  onClick={copyCode}
                  disabled={!panelId || !panelName || actions.length === 0}
                  className="flex-1 px-3 py-2 rounded bg-green-600 hover:bg-green-700 disabled:bg-white/10 disabled:text-white/30 text-white text-sm transition-colors"
                >
                  📋 Copy Code
                </button>
                <button
                  onClick={handleSave}
                  disabled={!panelId || !panelName || actions.length === 0}
                  className="flex-1 px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-white/10 disabled:text-white/30 text-white text-sm transition-colors"
                >
                  💾 Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
