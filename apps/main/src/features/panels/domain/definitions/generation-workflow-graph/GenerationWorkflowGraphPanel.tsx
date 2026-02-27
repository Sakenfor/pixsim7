import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MarkerType,
  type Connection,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler,
  type OnConnect,
} from 'reactflow';

import type {
  ChainStepDefinition,
  ExecuteEphemeralChainRequest,
  ExecuteEphemeralFanoutRequest,
  ChainExecution,
} from '@lib/api/chains';
import { executeEphemeralChain } from '@lib/api/chains';
import { Icon } from '@lib/icons';

import { buildBackendFanoutExecutionPolicy } from '@/features/generation/lib/fanoutExecutionPolicy';
import { BUILTIN_FANOUT_PRESETS, type FanoutPreset as FanoutExecutionPreset } from '@/features/generation/lib/fanoutPresets';
import {
  executeTrackedRawItemBackendExecution,
  extractLastAssetIdFromExecution,
  pollExecutionToTerminal,
  resolveRawItemExecutionModeFromPolicy,
} from '@/features/generation/lib/rawItemBackendExecution';
import { compileTemplateFanoutRequest, type TemplateFanoutInputRow } from '@/features/generation/lib/templateFanoutExecution';
import { useFanoutPresetStore } from '@/features/generation/stores/fanoutPresetStore';
import type { GenerationPreset } from '@/features/generation/stores/generationPresetStore';
import { useGenerationPresetStore } from '@/features/generation/stores/generationPresetStore';
import { GraphCanvasShell } from '@/features/graph/components/graph/GraphCanvasShell';
import type { GraphDomainAdapter } from '@/features/graph/components/graph/graphDomainAdapter';
import { GraphEditorSplitLayout } from '@/features/graph/components/graph/GraphEditorSplitLayout';
import { GraphSidebarSection } from '@/features/graph/components/graph/GraphSidebarSection';
import { useGraphCanvasAdapter } from '@/features/graph/hooks/useGraphCanvasAdapter';

type WorkflowNodeKind = 'chain_run' | 'fanout_run' | 'template_fanout';

interface BaseWorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  description?: string;
  position?: { x: number; y: number };
}

interface ChainRunNode extends BaseWorkflowNode {
  kind: 'chain_run';
  config: {
    provider_id: string;
    default_operation: string;
    initial_asset_mode: 'none' | 'previous';
    step_timeout?: number;
    execution_policy?: ExecuteEphemeralChainRequest['execution_policy'];
    steps_json: string;
  };
}

interface FanoutRunNode extends BaseWorkflowNode {
  kind: 'fanout_run';
  config: {
    provider_id: string;
    default_operation: string;
    continue_on_error: boolean;
    execution_policy?: ExecuteEphemeralFanoutRequest['execution_policy'];
    items_json: string;
  };
}

interface TemplateFanoutNode extends BaseWorkflowNode {
  kind: 'template_fanout';
  config: {
    provider_id: string;
    default_operation: string;
    continue_on_error: boolean;
    execution_policy?: ExecuteEphemeralFanoutRequest['execution_policy'];
    template_id: string;
    common_extra_params_json: string;
    common_run_context_json: string;
    inputs_json: string;
  };
}

type WorkflowNode = ChainRunNode | FanoutRunNode | TemplateFanoutNode;

interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
}

interface WorkflowState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface NodeRunState {
  nodeId: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  executionId?: string;
  executionStatus?: ChainExecution['status'];
  message?: string;
  lastAssetId?: number | null;
}

const STORAGE_KEY = 'generation_workflow_graph_poc_v1';

const DEFAULT_CHAIN_STEPS_JSON = JSON.stringify(
  [
    {
      id: 'step_1',
      label: 'Template step',
      template_id: '',
      operation: 'image_to_image',
      input_from: null,
      control_overrides: null,
      character_binding_overrides: null,
      guidance: null,
      guidance_inherit: null,
    },
  ],
  null,
  2,
);

const DEFAULT_FANOUT_ITEMS_JSON = JSON.stringify(
  [
    {
      id: 'item_1',
      label: 'Fanout item',
      operation: 'text_to_image',
      params: {
        prompt: 'Example prompt',
      },
    },
  ],
  null,
  2,
);

const DEFAULT_TEMPLATE_FANOUT_INPUTS_JSON = JSON.stringify(
  [
    {
      id: 'input_1',
      label: 'Template item',
      prompt: 'idle variation',
      source_asset_id: null,
      extraParams: {},
      runContext: {},
    },
  ],
  null,
  2,
);

function createNode(kind: WorkflowNodeKind): WorkflowNode {
  const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const position = { x: 80 + Math.floor(Math.random() * 40), y: 80 + Math.floor(Math.random() * 40) };
  if (kind === 'chain_run') {
    return {
      id,
      kind,
      label: 'Chain Run',
      position,
      config: {
        provider_id: 'pixverse',
        default_operation: 'image_to_image',
        initial_asset_mode: 'none',
        step_timeout: 600,
        execution_policy: {
          dispatch_mode: 'sequential',
          wait_policy: 'terminal_per_step',
          dependency_mode: 'previous',
          failure_policy: 'stop',
          force_new: true,
        },
        steps_json: DEFAULT_CHAIN_STEPS_JSON,
      },
    };
  }
  if (kind === 'template_fanout') {
    return {
      id,
      kind,
      label: 'Template Fanout',
      position,
      config: {
        provider_id: 'pixverse',
        default_operation: 'image_to_image',
        continue_on_error: true,
        execution_policy: {
          dispatch_mode: 'fanout',
          wait_policy: 'none',
          dependency_mode: 'none',
          failure_policy: 'continue',
          force_new: true,
        },
        template_id: '',
        common_extra_params_json: JSON.stringify({ source_asset_id: null }, null, 2),
        common_run_context_json: JSON.stringify({}, null, 2),
        inputs_json: DEFAULT_TEMPLATE_FANOUT_INPUTS_JSON,
      },
    };
  }
  return {
    id,
    kind,
    label: 'Fanout Run',
    position,
    config: {
      provider_id: 'pixverse',
      default_operation: 'text_to_image',
      continue_on_error: true,
      execution_policy: {
        dispatch_mode: 'fanout',
        wait_policy: 'none',
        dependency_mode: 'none',
        failure_policy: 'continue',
        force_new: true,
      },
      items_json: DEFAULT_FANOUT_ITEMS_JSON,
    },
  };
}

function createDefaultWorkflow(): WorkflowState {
  const start = createNode('chain_run');
  start.label = 'Start Chain';
  start.position = { x: 80, y: 100 };
  const second = createNode('fanout_run');
  second.label = 'Fanout Branch';
  second.position = { x: 380, y: 100 };
  return {
    nodes: [start, second],
    edges: [{ id: `edge_${Date.now()}`, from: start.id, to: second.id }],
  };
}

function parseJsonArray<T>(raw: string): T[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
  return parsed as T[];
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function getWorkflowNodePosition(node: WorkflowNode, index: number): { x: number; y: number } {
  if (
    node.position
    && Number.isFinite(node.position.x)
    && Number.isFinite(node.position.y)
  ) {
    return node.position;
  }
  return { x: 80 + (index % 3) * 260, y: 80 + Math.floor(index / 3) * 150 };
}

function buildTemplateFanoutPatchFromGenerationPreset(
  preset: GenerationPreset,
  currentNode: TemplateFanoutNode,
): Record<string, unknown> {
  const params = { ...(preset.params || {}) } as Record<string, unknown>;
  const providerId =
    (typeof params.providerId === 'string' && params.providerId) ||
    (typeof params.provider_id === 'string' && params.provider_id) ||
    currentNode.config.provider_id;

  delete params.prompt;
  delete params.source_asset_id;
  delete params.sourceAssetId;
  delete params.source_asset_ids;
  delete params.sourceAssetIds;
  delete params.provider_id;
  delete params.providerId;
  delete params.operation_type;
  delete params.operationType;

  const inputs: TemplateFanoutInputRow[] =
    preset.inputs.length > 0
      ? preset.inputs.map((inputRef, index) => ({
          id: `preset_${preset.id}_${index + 1}`,
          label: `${preset.name} #${index + 1}`,
          prompt: preset.prompt,
          source_asset_id: inputRef.assetId,
          extraParams: {},
          runContext: {},
        }))
      : [
          {
            id: `preset_${preset.id}_1`,
            label: preset.name,
            prompt: preset.prompt,
            source_asset_id: null,
            extraParams: {},
            runContext: {},
          },
        ];

  return {
    provider_id: providerId,
    default_operation: preset.operationType,
    common_extra_params_json: JSON.stringify(params, null, 2),
    inputs_json: JSON.stringify(inputs, null, 2),
  };
}

function buildTemplateFanoutPatchFromExecutionPreset(
  preset: FanoutExecutionPreset,
): Record<string, unknown> {
  if (preset.executionMode === 'sequential') {
    throw new Error('Template Fanout nodes only accept fanout execution presets');
  }
  return {
    continue_on_error: preset.onError !== 'stop',
    execution_policy: buildBackendFanoutExecutionPolicy({ onError: preset.onError }),
  };
}

function buildTemplateFanoutRequest(
  node: TemplateFanoutNode,
  previousAssetId: number | null,
): ExecuteEphemeralFanoutRequest {
  const commonExtra = parseJsonObject(node.config.common_extra_params_json);
  const commonRunContext = parseJsonObject(node.config.common_run_context_json);
  const inputs = parseJsonArray<TemplateFanoutInputRow>(node.config.inputs_json);
  return compileTemplateFanoutRequest({
    templateId: node.config.template_id,
    providerId: node.config.provider_id,
    defaultOperation: node.config.default_operation as ExecuteEphemeralFanoutRequest['default_operation'],
    continueOnError: node.config.continue_on_error,
    executionPolicy: node.config.execution_policy,
    nodeLabel: node.label,
    commonExtraParams: commonExtra,
    commonRunContext: commonRunContext,
    inputs,
    previousAssetId,
    runContextItemMetadata: {
      workflowNodeKind: 'template_fanout',
      workflowNodeId: node.id,
    },
  });
}

function getNodeVisualSummary(node: WorkflowNode): string {
  if (node.kind === 'chain_run') {
    try {
      const steps = parseJsonArray<unknown>(node.config.steps_json);
      return `${steps.length} step${steps.length === 1 ? '' : 's'} • ${node.config.default_operation}`;
    } catch {
      return `invalid steps JSON • ${node.config.default_operation}`;
    }
  }
  if (node.kind === 'fanout_run') {
    try {
      const items = parseJsonArray<unknown>(node.config.items_json);
      return `${items.length} item${items.length === 1 ? '' : 's'} • ${node.config.default_operation}`;
    } catch {
      return `invalid items JSON • ${node.config.default_operation}`;
    }
  }
  try {
    const rows = parseJsonArray<unknown>(node.config.inputs_json);
    const template = node.config.template_id.trim() ? `tpl` : 'no tpl';
    return `${rows.length} row${rows.length === 1 ? '' : 's'} • ${template} • ${node.config.default_operation}`;
  } catch {
    return `invalid inputs JSON • ${node.config.default_operation}`;
  }
}

function getNodeKindIcon(node: WorkflowNode): string {
  if (node.kind === 'chain_run') return 'git-branch';
  if (node.kind === 'template_fanout') return 'sparkles';
  return 'layers';
}

function estimateNodeSubmissionCount(node: WorkflowNode): number | null {
  try {
    if (node.kind === 'chain_run') {
      const steps = parseJsonArray<unknown>(node.config.steps_json);
      return steps.length;
    }
    if (node.kind === 'fanout_run') {
      const items = parseJsonArray<unknown>(node.config.items_json);
      return items.length;
    }
    const rows = parseJsonArray<unknown>(node.config.inputs_json);
    return rows.length;
  } catch {
    return null;
  }
}

function estimateWorkflowSubmissionCount(order: WorkflowNode[]): number | null {
  let total = 0;
  for (const node of order) {
    const n = estimateNodeSubmissionCount(node);
    if (n == null) return null;
    total += n;
  }
  return total;
}

function computeLinearOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): { order: WorkflowNode[]; warning?: string } {
  if (nodes.length === 0) return { order: [] };
  if (nodes.length === 1) return { order: [nodes[0]] };

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)!.push(edge.to);
  }

  const starts = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  if (starts.length !== 1) {
    return {
      order: nodes,
      warning: `Expected exactly 1 start node, found ${starts.length}. Using current node list order.`,
    };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const ordered: WorkflowNode[] = [];
  let current: string | undefined = starts[0].id;

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = byId.get(current);
    if (node) ordered.push(node);
    const nexts = outgoing.get(current) ?? [];
    if (nexts.length > 1) {
      return {
        order: ordered.concat(nodes.filter((n) => !visited.has(n.id))),
        warning: `Node "${node?.label || current}" has multiple outgoing edges; using first edge only.`,
      };
    }
    current = nexts[0];
  }

  if (visited.size !== nodes.length) {
    return {
      order: ordered.concat(nodes.filter((n) => !visited.has(n.id))),
      warning: 'Graph is disconnected or cyclic; appended remaining nodes in list order.',
    };
  }
  return { order: ordered };
}

export function GenerationWorkflowGraphPanel() {
  const [workflow, setWorkflow] = useState<WorkflowState>(createDefaultWorkflow);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, NodeRunState>>({});
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [edgeDraftFrom, setEdgeDraftFrom] = useState('');
  const [edgeDraftTo, setEdgeDraftTo] = useState('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<WorkflowState>;
      if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return;
      const normalizedNodes = (parsed.nodes as WorkflowNode[]).map((node, index) => ({
        ...node,
        position: getWorkflowNodePosition(node, index),
      }));
      setWorkflow({
        nodes: normalizedNodes,
        edges: parsed.edges as WorkflowEdge[],
      });
      if (normalizedNodes.length > 0) {
        setSelectedNodeId(normalizedNodes[0].id);
      }
    } catch {
      // ignore malformed local state
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workflow));
    } catch {
      // ignore storage failures
    }
  }, [workflow]);

  const selectedNode = useMemo(
    () => workflow.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [workflow.nodes, selectedNodeId],
  );

  const linear = useMemo(
    () => computeLinearOrder(workflow.nodes, workflow.edges),
    [workflow.nodes, workflow.edges],
  );
  const flowNodes = useMemo<FlowNode[]>(
    () =>
      workflow.nodes.map((node, index) => {
        const run = runs[node.id];
        const status = run?.status ?? 'idle';
        return {
          id: node.id,
          type: 'default',
          position: getWorkflowNodePosition(node, index),
          sourcePosition: 'right',
          targetPosition: 'left',
          selected: selectedNodeId === node.id,
          data: {
            label: (
              <div className="min-w-[140px]">
                <div className="flex items-center gap-1">
                  <Icon name={getNodeKindIcon(node) as any} size={10} />
                  <span className="truncate text-[11px] font-medium">{node.label}</span>
                </div>
                <div className="mt-0.5 text-[10px] opacity-70">{node.kind}</div>
                <div className="mt-0.5 text-[10px] opacity-70">
                  est submits: {estimateNodeSubmissionCount(node) ?? '?'}
                </div>
              </div>
            ),
          },
          style: {
            minWidth: 190,
            borderRadius: 10,
            borderColor:
              status === 'running'
                ? '#2563eb'
                : status === 'completed'
                  ? '#059669'
                  : status === 'failed'
                    ? '#dc2626'
                    : selectedNodeId === node.id
                      ? '#6366f1'
                      : '#cbd5e1',
            borderWidth: selectedNodeId === node.id ? 2 : 1,
            background:
              status === 'running'
                ? '#eff6ff'
                : status === 'completed'
                  ? '#ecfdf5'
                  : status === 'failed'
                    ? '#fef2f2'
                    : '#ffffff',
            color: '#111827',
          },
        };
      }),
    [workflow.nodes, runs, selectedNodeId],
  );
  const flowEdges = useMemo<FlowEdge[]>(
    () =>
      workflow.edges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#64748b', strokeWidth: 2 },
      })),
    [workflow.edges],
  );
  const estimatedWorkflowSubmissions = useMemo(
    () => estimateWorkflowSubmissionCount(linear.order),
    [linear.order],
  );

  const updateNode = useCallback((nodeId: string, patch: Partial<WorkflowNode>) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? ({ ...n, ...patch } as WorkflowNode) : n)),
    }));
  }, []);

  const updateSelectedNodeConfig = useCallback((patch: Record<string, unknown>) => {
    if (!selectedNode) return;
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== selectedNode.id) return n;
        return {
          ...n,
          config: {
            ...(n as any).config,
            ...patch,
          },
        } as WorkflowNode;
      }),
    }));
  }, [selectedNode]);

  const addNode = useCallback((kind: WorkflowNodeKind) => {
    const node = createNode(kind);
    setWorkflow((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedNodeId(node.id);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setWorkflow((prev) => ({
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    }));
    setSelectedNodeId((curr) => (curr === nodeId ? null : curr));
  }, []);

  const addEdge = useCallback(() => {
    if (!edgeDraftFrom || !edgeDraftTo || edgeDraftFrom === edgeDraftTo) return;
    setWorkflow((prev) => {
      if (prev.edges.some((e) => e.from === edgeDraftFrom && e.to === edgeDraftTo)) return prev;
      return {
        ...prev,
        edges: [...prev.edges, { id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, from: edgeDraftFrom, to: edgeDraftTo }],
      };
    });
  }, [edgeDraftFrom, edgeDraftTo]);

  const handleFlowConnect = useCallback<OnConnect>((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    setWorkflow((prev) => {
      if (prev.edges.some((e) => e.from === connection.source && e.to === connection.target)) return prev;
      return {
        ...prev,
        edges: [
          ...prev.edges,
          {
            id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            from: connection.source,
            to: connection.target,
          },
        ],
      };
    });
  }, []);

  const handleFlowNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleFlowNodeDragStop = useCallback((_: unknown, node: FlowNode) => {
    updateNode(node.id, { position: node.position });
  }, [updateNode]);

  const deleteEdge = useCallback((edgeId: string) => {
    setWorkflow((prev) => ({ ...prev, edges: prev.edges.filter((e) => e.id !== edgeId) }));
  }, []);

  const resetWorkflow = useCallback(() => {
    const next = createDefaultWorkflow();
    setWorkflow(next);
    setSelectedNodeId(next.nodes[0]?.id ?? null);
    setRuns({});
    setWorkflowMessage(null);
  }, []);

  const setNodeRun = useCallback((nodeId: string, patch: Partial<NodeRunState>) => {
    setRuns((prev) => ({
      ...prev,
      [nodeId]: {
        nodeId,
        status: prev[nodeId]?.status ?? 'idle',
        ...prev[nodeId],
        ...patch,
      },
    }));
  }, []);

  const executeSingleNode = useCallback(
    async (node: WorkflowNode, previousAssetId: number | null): Promise<{ lastAssetId: number | null; message: string }> => {
      if (node.kind === 'chain_run') {
        const steps = parseJsonArray<ChainStepDefinition>(node.config.steps_json);
        const request: ExecuteEphemeralChainRequest = {
          provider_id: node.config.provider_id,
          default_operation: node.config.default_operation,
          step_timeout: node.config.step_timeout,
          execution_policy: node.config.execution_policy,
          initial_asset_id: node.config.initial_asset_mode === 'previous' ? previousAssetId : null,
          name: node.label,
          description: node.description,
          steps,
        };
        const started = await executeEphemeralChain(request);
        setNodeRun(node.id, { status: 'running', executionId: started.execution_id, message: started.message });
        const terminal = await pollExecutionToTerminal(started.execution_id, { pollIntervalMs: 2000 });
        const lastAssetId = extractLastAssetIdFromExecution(terminal);
        setNodeRun(node.id, {
          status: terminal.status === 'completed' ? 'completed' : 'failed',
          executionStatus: terminal.status,
          lastAssetId,
          message: terminal.error_message || `Chain ${terminal.status}`,
        });
        if (terminal.status !== 'completed') {
          throw new Error(terminal.error_message || `Chain execution ${terminal.status}`);
        }
        return { lastAssetId, message: `Chain completed (${terminal.id})` };
      }

      const request: ExecuteEphemeralFanoutRequest =
        node.kind === 'template_fanout'
          ? buildTemplateFanoutRequest(node, previousAssetId)
          : {
              provider_id: node.config.provider_id,
              default_operation: node.config.default_operation,
              continue_on_error: node.config.continue_on_error,
              execution_policy: node.config.execution_policy,
              items: parseJsonArray<ExecuteEphemeralFanoutRequest['items'][number]>(node.config.items_json),
              name: node.label,
            };
      const rawMode = resolveRawItemExecutionModeFromPolicy(request.execution_policy);
      setNodeRun(node.id, { status: 'running', message: 'Starting...' });
      const { execution: terminal } = await executeTrackedRawItemBackendExecution({
        request,
        total: Array.isArray(request.items) ? request.items.length : 0,
        executionMode: rawMode,
        pollIntervalMs: 2000,
        onProgress: (progress, execution) => {
          setNodeRun(node.id, {
            status: 'running',
            executionId: execution.id,
            message: `${rawMode === 'sequential' ? 'Sequential' : 'Fanout'} ${progress.queued}/${progress.total}`,
          });
        },
      });
      const lastAssetId = extractLastAssetIdFromExecution(terminal);
      setNodeRun(node.id, {
        status: terminal.status === 'completed' ? 'completed' : 'failed',
        executionStatus: terminal.status,
        lastAssetId,
        message: terminal.error_message || `Fanout ${terminal.status}`,
      });
      if (terminal.status !== 'completed') {
        throw new Error(terminal.error_message || `Fanout execution ${terminal.status}`);
      }
      return { lastAssetId, message: `Fanout completed (${terminal.id})` };
    },
    [setNodeRun],
  );

  const runWorkflow = useCallback(async () => {
    if (workflow.nodes.length === 0) return;
    setIsRunningWorkflow(true);
    setWorkflowMessage(null);
    let previousAssetId: number | null = null;
    try {
      if (linear.warning) setWorkflowMessage(linear.warning);
      for (const node of linear.order) {
        setNodeRun(node.id, { status: 'running', message: 'Starting...' });
        const result = await executeSingleNode(node, previousAssetId);
        previousAssetId = result.lastAssetId ?? previousAssetId;
      }
      setWorkflowMessage('Workflow completed successfully');
    } catch (err) {
      setWorkflowMessage(err instanceof Error ? err.message : 'Workflow failed');
    } finally {
      setIsRunningWorkflow(false);
    }
  }, [workflow.nodes.length, linear, setNodeRun, executeSingleNode]);

  const runSelectedNode = useCallback(async () => {
    if (!selectedNode) return;
    setWorkflowMessage(null);
    try {
      await executeSingleNode(selectedNode, null);
    } catch (err) {
      setWorkflowMessage(err instanceof Error ? err.message : 'Node execution failed');
    }
  }, [selectedNode, executeSingleNode]);

  const graphCanvasAdapter = useGraphCanvasAdapter<GraphDomainAdapter>(
    () => ({
      nodes: flowNodes,
      edges: flowEdges,
      onNodeClick: handleFlowNodeClick,
      onNodeDragStop: handleFlowNodeDragStop,
      onConnect: handleFlowConnect,
      onNodesDelete: (nodes) => nodes.forEach((n) => deleteNode(n.id)),
      onEdgesDelete: (edges) => edges.forEach((e) => deleteEdge(e.id)),
    }),
    [
      flowNodes,
      flowEdges,
      handleFlowNodeClick,
      handleFlowNodeDragStop,
      handleFlowConnect,
      deleteNode,
      deleteEdge,
    ],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-700 px-3 py-2">
        <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Generation Workflow Graph (POC)
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => addNode('chain_run')}
            className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            + Chain Node
          </button>
          <button
            type="button"
            onClick={() => addNode('fanout_run')}
            className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            + Fanout Node
          </button>
          <button
            type="button"
            onClick={() => addNode('template_fanout')}
            className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            + Template Fanout
          </button>
          <button
            type="button"
            onClick={runWorkflow}
            disabled={isRunningWorkflow || workflow.nodes.length === 0}
            className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {isRunningWorkflow ? 'Running...' : 'Run Workflow'}
          </button>
          <button
            type="button"
            onClick={resetWorkflow}
            className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Reset
          </button>
        </div>
      </div>

      {workflowMessage && (
        <div className="border-b border-neutral-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-neutral-700 dark:bg-amber-900/20 dark:text-amber-200">
          {workflowMessage}
        </div>
      )}

      <div className="border-b border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
        Estimated submissions:{' '}
        <span className="font-semibold">
          {estimatedWorkflowSubmissions == null ? '?' : estimatedWorkflowSubmissions}
        </span>
        {estimatedWorkflowSubmissions == null && ' (some node JSON is invalid)'}
      </div>

      <GraphEditorSplitLayout
        sidebar={(
          <>
          <GraphSidebarSection title="Graph Canvas">
            <GraphCanvasShell
              adapter={graphCanvasAdapter}
              containerClassName="h-[280px]"
            />
            <div className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
              Drag nodes to position them. Connect nodes via handles. Use the forms below for detailed config.
            </div>
          </GraphSidebarSection>

          <GraphSidebarSection title="Flow Preview">
            <div className="rounded border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900/30">
              {linear.order.length === 0 ? (
                <div className="text-[11px] text-neutral-500">No nodes yet.</div>
              ) : (
                <div className="space-y-2">
                  {linear.warning && (
                    <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                      {linear.warning}
                    </div>
                  )}
                  <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
                    {linear.order.map((node, idx) => {
                      const run = runs[node.id];
                      return (
                        <div key={`flow_${node.id}`} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedNodeId(node.id)}
                            className={clsx(
                              'min-w-[170px] rounded border p-2 text-left',
                              selectedNodeId === node.id
                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                                : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/50',
                            )}
                          >
                            <div className="mb-1 flex items-center gap-1">
                              <Icon name={getNodeKindIcon(node) as any} size={11} />
                              <span className="truncate text-[11px] font-medium">{node.label}</span>
                              <span
                                className={clsx(
                                  'ml-auto rounded px-1 py-0.5 text-[9px]',
                                  !run || run.status === 'idle'
                                    ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                                    : run.status === 'running'
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                      : run.status === 'completed'
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                                )}
                              >
                                {run?.status ?? 'idle'}
                              </span>
                            </div>
                            <div className="truncate text-[10px] text-neutral-500">{node.kind}</div>
                            <div className="mt-0.5 line-clamp-2 text-[10px] text-neutral-600 dark:text-neutral-300">
                              {getNodeVisualSummary(node)}
                            </div>
                            {typeof run?.lastAssetId === 'number' && (
                              <div className="mt-1 text-[10px] text-neutral-500">asset {run.lastAssetId}</div>
                            )}
                          </button>
                          {idx < linear.order.length - 1 && (
                            <div className="flex items-center px-0.5 text-neutral-400" aria-hidden>
                              <Icon name="arrow-right" size={11} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </GraphSidebarSection>

          <GraphSidebarSection title="Nodes" className="mb-0" titleClassName="mb-2">
          <div className="space-y-1.5">
            {workflow.nodes.map((node) => {
              const run = runs[node.id];
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNodeId(node.id)}
                  className={clsx(
                    'w-full rounded border p-2 text-left',
                    selectedNodeId === node.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/50',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon name={node.kind === 'chain_run' ? 'git-branch' : 'layers'} size={12} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{node.label}</div>
                      <div className="truncate text-[10px] text-neutral-500">{node.kind}</div>
                    </div>
                    <span
                      className={clsx(
                        'rounded px-1 py-0.5 text-[9px]',
                        !run || run.status === 'idle'
                          ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                          : run.status === 'running'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : run.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                      )}
                    >
                      {run?.status ?? 'idle'}
                    </span>
                  </div>
                  {run?.executionId && (
                    <div className="mt-1 truncate text-[10px] text-neutral-500">
                      exec: {run.executionId}
                      {typeof run.lastAssetId === 'number' ? ` • asset ${run.lastAssetId}` : ''}
                    </div>
                  )}
                  <div className="mt-0.5 text-[10px] text-neutral-500">
                    est submits: {estimateNodeSubmissionCount(node) ?? '?'}
                  </div>
                </button>
              );
            })}
          </div>
          </GraphSidebarSection>

          <GraphSidebarSection
            title="Edges"
            className="mt-4 border-t border-neutral-200 pt-3 mb-0 dark:border-neutral-700"
          >
            <div className="grid grid-cols-2 gap-1">
              <select
                value={edgeDraftFrom}
                onChange={(e) => setEdgeDraftFrom(e.target.value)}
                className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
              >
                <option value="">From...</option>
                {workflow.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <select
                value={edgeDraftTo}
                onChange={(e) => setEdgeDraftTo(e.target.value)}
                className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
              >
                <option value="">To...</option>
                {workflow.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={addEdge}
              className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Add Edge
            </button>
            <div className="mt-2 space-y-1">
              {workflow.edges.map((e) => {
                const from = workflow.nodes.find((n) => n.id === e.from)?.label ?? e.from;
                const to = workflow.nodes.find((n) => n.id === e.to)?.label ?? e.to;
                return (
                  <div key={e.id} className="flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-[11px] dark:border-neutral-700">
                    <span className="truncate">{from}</span>
                    <span className="text-neutral-400">→</span>
                    <span className="truncate flex-1">{to}</span>
                    <button
                      type="button"
                      onClick={() => deleteEdge(e.id)}
                      className="text-neutral-400 hover:text-red-500"
                      title="Delete edge"
                    >
                      <Icon name="trash" size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          </GraphSidebarSection>

          <div className="mt-4 rounded border border-dashed border-neutral-300 p-2 text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
            <div className="font-semibold mb-1">POC notes</div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Linear execution order is inferred from edges (single start preferred).</li>
              <li><code>chain_run</code> nodes use backend <code>execute-ephemeral</code>.</li>
              <li><code>fanout_run</code> nodes use backend <code>execute-fanout-ephemeral</code>.</li>
              <li><code>template_fanout</code> compiles template inputs into backend fanout items.</li>
            </ul>
          </div>
          </>
        )}
        main={(
          <>
          {!selectedNode ? (
            <div className="text-sm text-neutral-500">Select a node to edit.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={selectedNode.label}
                  onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                  className="flex-1 rounded border border-neutral-200 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                />
                <button
                  type="button"
                  onClick={runSelectedNode}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                >
                  Run Node
                </button>
                <button
                  type="button"
                  onClick={() => deleteNode(selectedNode.id)}
                  className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-900/20"
                >
                  Delete
                </button>
              </div>

              <textarea
                value={selectedNode.description ?? ''}
                onChange={(e) => updateNode(selectedNode.id, { description: e.target.value })}
                rows={2}
                placeholder="Optional node description"
                className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
              />

              <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-300">
                Estimated submissions from this node:{' '}
                <span className="font-semibold">
                  {estimateNodeSubmissionCount(selectedNode) ?? '?'}
                </span>
              </div>

              {selectedNode.kind === 'chain_run' ? (
                <ChainRunEditor node={selectedNode} onPatch={updateSelectedNodeConfig} />
              ) : selectedNode.kind === 'template_fanout' ? (
                <TemplateFanoutEditor node={selectedNode} onPatch={updateSelectedNodeConfig} />
              ) : (
                <FanoutRunEditor node={selectedNode} onPatch={updateSelectedNodeConfig} />
              )}
            </div>
          )}
          </>
        )}
      />
    </div>
  );
}

function ChainRunEditor({
  node,
  onPatch,
}: {
  node: ChainRunNode;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Provider">
          <input
            type="text"
            value={node.config.provider_id}
            onChange={(e) => onPatch({ provider_id: e.target.value })}
            className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          />
        </Field>
        <Field label="Default Operation">
          <input
            type="text"
            value={node.config.default_operation}
            onChange={(e) => onPatch({ default_operation: e.target.value })}
            className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          />
        </Field>
        <Field label="Initial Asset">
          <select
            value={node.config.initial_asset_mode}
            onChange={(e) => onPatch({ initial_asset_mode: e.target.value })}
            className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="none">none</option>
            <option value="previous">previous workflow asset</option>
          </select>
        </Field>
        <Field label="Step Timeout (s)">
          <input
            type="number"
            min={5}
            value={node.config.step_timeout ?? 600}
            onChange={(e) => onPatch({ step_timeout: Number(e.target.value || 600) })}
            className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          />
        </Field>
      </div>

      <AdvancedSection title="Advanced JSON">
        <JsonField
          label="Chain Steps JSON (ChainStepDefinition[])"
          value={node.config.steps_json}
          onChange={(v) => onPatch({ steps_json: v })}
        />
        <JsonField
          label="Execution Policy JSON (optional)"
          value={JSON.stringify(node.config.execution_policy ?? {}, null, 2)}
          onChange={(v) => {
            try {
              onPatch({ execution_policy: v.trim() ? JSON.parse(v) : undefined });
            } catch {
              onPatch({ execution_policy: node.config.execution_policy });
            }
          }}
        />
      </AdvancedSection>
    </div>
  );
}

function FanoutRunEditor({
  node,
  onPatch,
}: {
  node: FanoutRunNode;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Provider">
          <input
            type="text"
            value={node.config.provider_id}
            onChange={(e) => onPatch({ provider_id: e.target.value })}
            className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          />
        </Field>
        <Field label="Default Operation">
          <input
            type="text"
            value={node.config.default_operation}
            onChange={(e) => onPatch({ default_operation: e.target.value })}
            className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          />
        </Field>
        <Field label="Continue on Error" className="col-span-2">
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={node.config.continue_on_error}
              onChange={(e) => onPatch({ continue_on_error: e.target.checked })}
            />
            continue submitting remaining items after a submit failure
          </label>
        </Field>
      </div>

      <AdvancedSection title="Advanced JSON">
        <JsonField
          label="Fanout Items JSON (FanoutItemRequest[])"
          value={node.config.items_json}
          onChange={(v) => onPatch({ items_json: v })}
        />
        <JsonField
          label="Execution Policy JSON (optional)"
          value={JSON.stringify(node.config.execution_policy ?? {}, null, 2)}
          onChange={(v) => {
            try {
              onPatch({ execution_policy: v.trim() ? JSON.parse(v) : undefined });
            } catch {
              onPatch({ execution_policy: node.config.execution_policy });
            }
          }}
        />
      </AdvancedSection>
    </div>
  );
}

function TemplateFanoutEditor({
  node,
  onPatch,
}: {
  node: TemplateFanoutNode;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const generationPresets = useGenerationPresetStore((s) => s.presets);
  const customFanoutPresets = useFanoutPresetStore((s) => s.presets);
  const fanoutCompatibleBuiltinExecutionPresets = useMemo(
    () => BUILTIN_FANOUT_PRESETS.filter((p) => p.executionMode !== 'sequential'),
    [],
  );
  const fanoutCompatibleCustomExecutionPresets = useMemo(
    () => customFanoutPresets.filter((p) => p.executionMode !== 'sequential'),
    [customFanoutPresets],
  );
  const allExecutionPresets = useMemo(
    () => [...fanoutCompatibleBuiltinExecutionPresets, ...fanoutCompatibleCustomExecutionPresets],
    [fanoutCompatibleBuiltinExecutionPresets, fanoutCompatibleCustomExecutionPresets],
  );
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [selectedExecutionPresetId, setSelectedExecutionPresetId] = useState('');
  const selectedPreset = useMemo(
    () => generationPresets.find((p) => p.id === selectedPresetId) ?? null,
    [generationPresets, selectedPresetId],
  );
  const selectedExecutionPreset = useMemo(
    () => allExecutionPresets.find((p) => p.id === selectedExecutionPresetId) ?? null,
    [allExecutionPresets, selectedExecutionPresetId],
  );

  return (
    <div className="space-y-3">
      <div className="rounded border border-neutral-200 p-2 dark:border-neutral-700">
        <div className="mb-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          Apply QuickGen Generation Preset
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className="min-w-0 flex-1 rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="">Select preset…</option>
            {generationPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} ({preset.operationType})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedPreset}
            onClick={() => {
              if (!selectedPreset) return;
              onPatch(buildTemplateFanoutPatchFromGenerationPreset(selectedPreset, node));
            }}
            className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
            title="Apply provider/operation/common params and template inputs from the selected QuickGen preset"
          >
            Apply
          </button>
        </div>
        <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
          Imports provider, operation, common params, prompt, and preset input asset IDs. Template ID and execution policy are preserved.
        </div>
      </div>

      <div className="rounded border border-neutral-200 p-2 dark:border-neutral-700">
        <div className="mb-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          Apply Execution Preset (Fanout)
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedExecutionPresetId}
            onChange={(e) => setSelectedExecutionPresetId(e.target.value)}
            className="min-w-0 flex-1 rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="">Select execution preset…</option>
            {fanoutCompatibleBuiltinExecutionPresets.length > 0 && (
              <optgroup label="Built-in">
                {fanoutCompatibleBuiltinExecutionPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </optgroup>
            )}
            {fanoutCompatibleCustomExecutionPresets.length > 0 && (
              <optgroup label="Custom">
                {fanoutCompatibleCustomExecutionPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            disabled={!selectedExecutionPreset}
            onClick={() => {
              if (!selectedExecutionPreset) return;
              onPatch(buildTemplateFanoutPatchFromExecutionPreset(selectedExecutionPreset));
            }}
            className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
            title="Apply fanout error behavior and backend execution policy defaults"
          >
            Apply
          </button>
        </div>
        <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
          Maps fanout-compatible execution presets to backend fanout policy (strategy/repeat/set-pick remain graph planning concerns and are not applied here).
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Provider">
          <input
            type="text"
            value={node.config.provider_id}
            onChange={(e) => onPatch({ provider_id: e.target.value })}
            className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          />
        </Field>
        <Field label="Default Operation">
          <input
            type="text"
            value={node.config.default_operation}
            onChange={(e) => onPatch({ default_operation: e.target.value })}
            className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          />
        </Field>
        <Field label="Template ID" className="col-span-2">
          <input
            type="text"
            value={node.config.template_id}
            onChange={(e) => onPatch({ template_id: e.target.value })}
            placeholder="BlockTemplate UUID"
            className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          />
        </Field>
        <Field label="Continue on Error" className="col-span-2">
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={node.config.continue_on_error}
              onChange={(e) => onPatch({ continue_on_error: e.target.checked })}
            />
            continue submitting remaining compiled template items after a submit failure
          </label>
        </Field>
      </div>

      <AdvancedSection title="Advanced JSON">
        <JsonField
          label="Common Extra Params JSON (merged into each item)"
          value={node.config.common_extra_params_json}
          onChange={(v) => onPatch({ common_extra_params_json: v })}
        />
        <JsonField
          label="Common Run Context JSON (merged into each item before block_template_id)"
          value={node.config.common_run_context_json}
          onChange={(v) => onPatch({ common_run_context_json: v })}
        />
        <JsonField
          label="Template Inputs JSON (rows compiled via Quick Generate request helper)"
          value={node.config.inputs_json}
          onChange={(v) => onPatch({ inputs_json: v })}
        />
        <JsonField
          label="Execution Policy JSON (optional)"
          value={JSON.stringify(node.config.execution_policy ?? {}, null, 2)}
          onChange={(v) => {
            try {
              onPatch({ execution_policy: v.trim() ? JSON.parse(v) : undefined });
            } catch {
              onPatch({ execution_policy: node.config.execution_policy });
            }
          }}
        />
        <div className="rounded border border-dashed border-neutral-300 p-2 text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
          <div className="mb-1 font-semibold">Template input row shape</div>
          <pre className="whitespace-pre-wrap">{`{ "id": "a", "label": "idle", "prompt": "idle variation", "source_asset_id": 123, "extraParams": {}, "runContext": {} }`}</pre>
          <div className="mt-1">
            Compiles with <code>prepareGenerateAssetSubmission()</code> and injects{' '}
            <code>runContext.block_template_id</code>.
          </div>
        </div>
      </AdvancedSection>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={clsx('flex flex-col gap-1 text-xs', className)}>
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function AdvancedSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2 rounded border border-neutral-200 p-2 dark:border-neutral-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        <span>{title}</span>
        <span className="text-neutral-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <textarea
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          try {
            if (next.trim()) JSON.parse(next);
            setError(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid JSON');
          }
        }}
        rows={10}
        className={clsx(
          'w-full rounded border bg-white px-2 py-1 text-[11px] font-mono dark:bg-neutral-800',
          error ? 'border-red-400 dark:border-red-700' : 'border-neutral-200 dark:border-neutral-700',
        )}
      />
      {error && <div className="text-[11px] text-red-600 dark:text-red-400">{error}</div>}
    </div>
  );
}
