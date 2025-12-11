/**
 * NPC Response Node Editor
 * Visual editor for NPC response graphs with tool interaction testing
 */

import { useState, useCallback, useMemo } from 'react';
import type { NpcResponseMetadata, ResponseGraphTemplate, RESPONSE_TEMPLATES } from '@/types/npcResponseNode';
import { Panel, Button, Select, Input } from '@pixsim7/shared.ui';

interface NpcResponseNodeEditorProps {
  nodeId: string;
  metadata: NpcResponseMetadata;
  onUpdate: (metadata: Partial<NpcResponseMetadata>) => void;
}

export function NpcResponseNodeEditor({
  nodeId,
  metadata,
  onUpdate,
}: NpcResponseNodeEditorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showGraphEditor, setShowGraphEditor] = useState(false);
  const [testMode, setTestMode] = useState(false);

  // Load template
  const handleLoadTemplate = useCallback((templateId: string) => {
    const template = RESPONSE_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      onUpdate({
        responseGraph: template.graph,
      });
    }
  }, [onUpdate]);

  // Update NPC settings
  const handleNpcUpdate = useCallback((updates: Partial<NpcResponseMetadata['npc']>) => {
    onUpdate({
      npc: { ...metadata.npc, ...updates },
    });
  }, [metadata.npc, onUpdate]);

  // Update video generation settings
  const handleVideoGenUpdate = useCallback((updates: Partial<NpcResponseMetadata['videoGen']>) => {
    onUpdate({
      videoGen: { ...metadata.videoGen, ...updates },
    });
  }, [metadata.videoGen, onUpdate]);

  // Update interaction settings
  const handleInteractionUpdate = useCallback((updates: Partial<NpcResponseMetadata['interaction']>) => {
    onUpdate({
      interaction: { ...metadata.interaction, ...updates },
    });
  }, [metadata.interaction, onUpdate]);

  // Count nodes in graph
  const nodeCount = metadata.responseGraph?.nodes?.length || 0;
  const connectionCount = metadata.responseGraph?.connections?.length || 0;

  return (
    <div className="npc-response-editor space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <span>🎭</span>
          <span>NPC Response Node</span>
        </h2>
        <Button
          onClick={() => setShowGraphEditor(!showGraphEditor)}
          variant="primary"
        >
          {showGraphEditor ? 'Close' : 'Open'} Graph Editor
        </Button>
      </div>

      {/* NPC Settings */}
      <Panel title="NPC Character">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <Input
              value={metadata.npc.name}
              onChange={(e) => handleNpcUpdate({ name: e.target.value })}
              placeholder="NPC Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Avatar URL (optional)</label>
            <Input
              value={metadata.npc.avatarUrl || ''}
              onChange={(e) => handleNpcUpdate({ avatarUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Personality Preset</label>
            <Select
              value={metadata.npc.personality || 'gentle'}
              onChange={(value) => handleNpcUpdate({ personality: value as any })}
              options={[
                { value: 'gentle', label: '🌸 Gentle - Sensitive, soft reactions' },
                { value: 'intense', label: '🔥 Intense - Strong, passionate responses' },
                { value: 'playful', label: '😄 Playful - Fun, varied reactions' },
                { value: 'custom', label: '⚙️ Custom - Define your own' },
              ]}
            />
          </div>
        </div>
      </Panel>

      {/* Response Graph */}
      <Panel title="Response Graph">
        <div className="space-y-4">
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Graph Stats: {nodeCount} nodes, {connectionCount} connections
                </p>
              </div>
              <Button
                onClick={() => setShowGraphEditor(true)}
                size="sm"
                variant="outline"
              >
                Edit Graph
              </Button>
            </div>

            {/* Template Selector */}
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">Load Template</label>
              <div className="grid grid-cols-1 gap-2">
                {RESPONSE_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleLoadTemplate(template.id)}
                    className="text-left p-3 border border-neutral-300 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <div className="font-medium">{template.name}</div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      {template.description}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      Category: {template.category}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Video Generation Settings */}
      <Panel title="AI Video Generation">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="video-enabled"
              checked={metadata.videoGen.enabled}
              onChange={(e) => handleVideoGenUpdate({ enabled: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="video-enabled" className="text-sm font-medium">
              Enable AI video generation
            </label>
          </div>

          {metadata.videoGen.enabled && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Base Prompt</label>
                <Input
                  value={metadata.videoGen.basePrompt || ''}
                  onChange={(e) => handleVideoGenUpdate({ basePrompt: e.target.value })}
                  placeholder="anime girl, detailed face, soft lighting"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Base prompt that will be combined with graph-generated expressions/emotions
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Art Style</label>
                <Select
                  value={metadata.videoGen.style?.artStyle || 'anime'}
                  onChange={(value) => handleVideoGenUpdate({
                    style: { ...metadata.videoGen.style, artStyle: value as any },
                  })}
                  options={[
                    { value: 'anime', label: 'Anime' },
                    { value: 'realistic', label: 'Realistic' },
                    { value: 'semi-realistic', label: 'Semi-Realistic' },
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Quality</label>
                <Select
                  value={metadata.videoGen.style?.quality || 'standard'}
                  onChange={(value) => handleVideoGenUpdate({
                    style: { ...metadata.videoGen.style, quality: value as any },
                  })}
                  options={[
                    { value: 'draft', label: 'Draft (Fast)' },
                    { value: 'standard', label: 'Standard' },
                    { value: 'high', label: 'High Quality' },
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">LoRA Models (comma-separated)</label>
                <Input
                  value={metadata.videoGen.style?.loras?.join(', ') || ''}
                  onChange={(e) => handleVideoGenUpdate({
                    style: {
                      ...metadata.videoGen.style,
                      loras: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                    },
                  })}
                  placeholder="model_name_1, model_name_2"
                />
              </div>
            </>
          )}
        </div>
      </Panel>

      {/* Real-Time Generation Settings */}
      {metadata.videoGen.enabled && (
        <Panel title="⚡ Real-Time Generation (Gameplay)">
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                These settings control how videos are generated during gameplay. Lower quality = faster generation.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Quality/Speed Preset</label>
              <Select
                value={metadata.videoGen.realtime?.preset || 'fast'}
                onChange={(value) => handleVideoGenUpdate({
                  realtime: { ...metadata.videoGen.realtime, preset: value as any } as any,
                })}
                options={[
                  { value: 'realtime', label: '⚡ Real-time (2-3s) - 256x256, 8fps, 4 steps' },
                  { value: 'fast', label: '🚀 Fast (3-5s) - 512x512, 12fps, 8 steps' },
                  { value: 'balanced', label: '⚖️ Balanced (5-10s) - 512x512, 24fps, 15 steps' },
                  { value: 'quality', label: '💎 Quality (10-20s) - 768x768, 30fps, 25 steps' },
                ]}
              />
              <p className="text-xs text-neutral-500 mt-1">
                Uses LCM/Lightning models for fast generation. Times are estimates.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Max Wait Time (ms)
              </label>
              <Input
                type="number"
                value={metadata.videoGen.realtime?.maxWaitTime || 5000}
                onChange={(e) => handleVideoGenUpdate({
                  realtime: {
                    ...metadata.videoGen.realtime,
                    maxWaitTime: parseInt(e.target.value) || 5000,
                  } as any,
                })}
                min={1000}
                step={500}
              />
              <p className="text-xs text-neutral-500 mt-1">
                Show fallback if generation exceeds this time
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Fallback Strategy</label>
              <Select
                value={metadata.videoGen.realtime?.fallback || 'placeholder'}
                onChange={(value) => handleVideoGenUpdate({
                  realtime: { ...metadata.videoGen.realtime, fallback: value as any } as any,
                })}
                options={[
                  { value: 'placeholder', label: '📄 Placeholder - Show text overlay' },
                  { value: 'procedural', label: '🎨 Procedural - Use animated sprites' },
                  { value: 'cached', label: '💾 Cached - Show similar cached video' },
                  { value: 'freeze', label: '❄️ Freeze - Keep current frame' },
                ]}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="predictive"
                checked={metadata.videoGen.realtime?.predictive !== false}
                onChange={(e) => handleVideoGenUpdate({
                  realtime: {
                    ...metadata.videoGen.realtime,
                    predictive: e.target.checked,
                  } as any,
                })}
                className="rounded"
              />
              <label htmlFor="predictive" className="text-sm">
                🔮 Enable predictive pre-generation
              </label>
            </div>
            <p className="text-xs text-neutral-500 ml-6">
              AI predicts next likely states and generates them in background
            </p>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="progressive"
                checked={metadata.videoGen.realtime?.progressive !== false}
                onChange={(e) => handleVideoGenUpdate({
                  realtime: {
                    ...metadata.videoGen.realtime,
                    progressive: e.target.checked,
                  } as any,
                })}
                className="rounded"
              />
              <label htmlFor="progressive" className="text-sm">
                📈 Progressive loading (low → high quality)
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pregenerate"
                checked={metadata.videoGen.realtime?.preGenerate !== false}
                onChange={(e) => handleVideoGenUpdate({
                  realtime: {
                    ...metadata.videoGen.realtime,
                    preGenerate: e.target.checked,
                  } as any,
                })}
                className="rounded"
              />
              <label htmlFor="pregenerate" className="text-sm">
                ⏱️ Pre-generate common states on scene load
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Cache Size (videos)
              </label>
              <Input
                type="number"
                value={metadata.videoGen.realtime?.cacheSize || 50}
                onChange={(e) => handleVideoGenUpdate({
                  realtime: {
                    ...metadata.videoGen.realtime,
                    cacheSize: parseInt(e.target.value) || 50,
                  } as any,
                })}
                min={10}
                max={200}
                step={10}
              />
              <p className="text-xs text-neutral-500 mt-1">
                Number of generated videos to keep in memory
              </p>
            </div>
          </div>
        </Panel>
      )}

      {/* Interaction Settings */}
      <Panel title="Interaction Settings">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Response Cooldown (ms)
            </label>
            <Input
              type="number"
              value={metadata.interaction.responseCooldown || 500}
              onChange={(e) => handleInteractionUpdate({
                responseCooldown: parseInt(e.target.value) || 500,
              })}
              min={0}
              step={100}
            />
            <p className="text-xs text-neutral-500 mt-1">
              Minimum time between response evaluations
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Enabled Tools (comma-separated IDs)
            </label>
            <Input
              value={metadata.interaction.enabledTools?.join(', ') || 'touch, feather, temperature'}
              onChange={(e) => handleInteractionUpdate({
                enabledTools: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
              })}
              placeholder="touch, feather, water"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Interactive Zones (comma-separated)
            </label>
            <Input
              value={metadata.interaction.zones?.join(', ') || 'face, shoulder, hand'}
              onChange={(e) => handleInteractionUpdate({
                zones: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
              })}
              placeholder="face, shoulder, ribs, feet"
            />
          </div>
        </div>
      </Panel>

      {/* Test Mode */}
      <Panel title="Test & Debug">
        <div className="space-y-4">
          <Button
            onClick={() => setTestMode(!testMode)}
            variant="outline"
            fullWidth
          >
            {testMode ? 'Stop' : 'Start'} Test Mode
          </Button>

          {testMode && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                🎮 Test Mode Active
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-300">
                Use the tools panel to interact with this NPC and see real-time responses.
                Video generation will be simulated.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show-graph"
              checked={metadata.debug?.showGraph || false}
              onChange={(e) => onUpdate({
                debug: { ...metadata.debug, showGraph: e.target.checked },
              })}
              className="rounded"
            />
            <label htmlFor="show-graph" className="text-sm">
              Show graph during playback
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="log-evaluations"
              checked={metadata.debug?.logEvaluations || false}
              onChange={(e) => onUpdate({
                debug: { ...metadata.debug, logEvaluations: e.target.checked },
              })}
              className="rounded"
            />
            <label htmlFor="log-evaluations" className="text-sm">
              Log graph evaluations to console
            </label>
          </div>
        </div>
      </Panel>

      {/* Graph Editor Modal (if open) */}
      {showGraphEditor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-lg font-bold">Response Graph Editor</h3>
              <Button onClick={() => setShowGraphEditor(false)} variant="ghost">
                ✕ Close
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ResponseGraphEditor
                graph={metadata.responseGraph}
                onChange={(graph) => onUpdate({ responseGraph: graph })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Visual graph editor component (placeholder)
 * TODO: Implement with React Flow or similar
 */
function ResponseGraphEditor({
  graph,
  onChange,
}: {
  graph: NpcResponseMetadata['responseGraph'];
  onChange: (graph: NpcResponseMetadata['responseGraph']) => void;
}) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
      <div className="text-center">
        <p className="text-2xl mb-4">🚧 Graph Editor Coming Soon</p>
        <p className="text-neutral-600 dark:text-neutral-400">
          Visual node editor will be implemented here using React Flow
        </p>
        <div className="mt-8 text-left max-w-md">
          <p className="font-medium mb-2">Current Graph:</p>
          <pre className="text-xs bg-white dark:bg-neutral-900 p-4 rounded overflow-auto max-h-64">
            {JSON.stringify(graph, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
