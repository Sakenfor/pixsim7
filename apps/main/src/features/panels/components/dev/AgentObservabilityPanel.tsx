/**
 * AgentObservabilityPanel - AI agent activity dashboard
 *
 * Shows the contract graph with live agent presence, session history,
 * and utilization stats. Uses /meta/contracts, /meta/agents, /meta/agents/history, /meta/agents/stats.
 */

import {
  Badge,
  Button,
  EmptyState,
  SectionHeader,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  StatCard,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';

import { openWorkspacePanel } from '@features/workspace';

// =============================================================================
// Types
// =============================================================================

interface AgentPresence {
  session_id: string;
  agent_type: string;
  status: string;
  action: string;
  detail: string;
  plan_id: string | null;
  duration_seconds: number;
}

interface ContractEndpoint {
  id: string;
  method: string;
  path: string;
  summary: string;
}

interface EndpointDisplayEntry {
  key: string;
  method: string;
  path: string;
  summary: string;
  endpoint: ContractEndpoint | null;
}

interface ContractNode {
  id: string;
  name: string;
  endpoint: string | null;
  version: string;
  owner: string;
  summary: string;
  provides: string[];
  relates_to: string[];
  sub_endpoints: ContractEndpoint[];
  active_agents: AgentPresence[];
}

interface ContractsResponse {
  version: string;
  generated_at: string;
  contracts: ContractNode[];
  total_active_agents: number;
}

interface AgentSessionEntry {
  session_id: string;
  agent_type: string;
  status: string;
  started_at: string;
  last_heartbeat: string;
  duration_seconds: number;
  current_plan_id: string | null;
  current_contract_id: string | null;
  current_action: string;
  current_detail: string;
  recent_activity: {
    action: string;
    detail: string;
    contract_id: string | null;
    plan_id: string | null;
    timestamp: string;
  }[];
}

interface AgentSessionsResponse {
  active: AgentSessionEntry[];
  total_active: number;
  total_all: number;
}

interface AgentHistoryEntry {
  session_id: string;
  agent_type: string;
  status: string;
  contract_id: string | null;
  plan_id: string | null;
  action: string;
  detail: string | null;
  timestamp: string;
}

interface AgentHistoryResponse {
  entries: AgentHistoryEntry[];
  total: number;
}

interface AgentStatsResponse {
  total_heartbeats: number;
  unique_sessions: number;
  by_contract: { contract_id: string; heartbeat_count: number; unique_sessions: number }[];
  by_plan: { plan_id: string; heartbeat_count: number; unique_sessions: number }[];
}

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatTimestamp(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function navigateToPlan(planId: string) {
  // Write target nav ID so Plans panel auto-navigates on mount
  try { localStorage.setItem('plans-panel:nav', `plan:${planId}`); } catch { /* ignore */ }
  openWorkspacePanel('dev-tool:plans');
}

function PlanLink({ planId }: { planId: string }) {
  return (
    <button
      onClick={() => navigateToPlan(planId)}
      className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
    >
      {planId}
    </button>
  );
}

const STATUS_COLORS: Record<string, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  active: 'green',
  paused: 'orange',
  completed: 'blue',
  errored: 'red',
};

const AI_ASSISTANT_DRAFT_KEY = 'ai-assistant:draft';
const AI_ASSISTANT_INJECT_PROMPT_EVENT = 'ai-assistant:inject-prompt';

function getEndpointEntries(node: ContractNode): EndpointDisplayEntry[] {
  const entries: EndpointDisplayEntry[] = [];
  if (node.endpoint) {
    entries.push({
      key: `${node.id}:contract`,
      method: 'GET',
      path: node.endpoint,
      summary: node.summary || `Contract endpoint for ${node.id}.`,
      endpoint: null,
    });
  }
  for (const ep of node.sub_endpoints) {
    entries.push({
      key: `${node.id}:${ep.id}:${ep.method}:${ep.path}`,
      method: ep.method,
      path: ep.path,
      summary: ep.summary,
      endpoint: ep,
    });
  }
  return entries;
}

function getEndpointViewTarget(path: string, method: string): { href: string; label: 'View' | 'Docs' } {
  const rawPath = String(path || '').trim();
  const upperMethod = String(method || '').toUpperCase();
  if (!rawPath) return { href: '/docs', label: 'Docs' };

  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return { href: rawPath, label: 'View' };
  }

  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const hasPathParams = normalizedPath.includes('{') || normalizedPath.includes('}');

  if (upperMethod === 'GET' && !hasPathParams) {
    return { href: normalizedPath, label: 'View' };
  }

  return { href: '/docs', label: 'Docs' };
}

function openEndpointView(path: string, method: string) {
  const target = getEndpointViewTarget(path, method);
  window.open(target.href, '_blank', 'noopener,noreferrer');
}

function buildContractPrompt(node: ContractNode, endpoint?: ContractEndpoint): string {
  if (!endpoint) {
    return `Help me use contract ${node.id} (${node.name}). Explain available actions and suggest the best next step.`;
  }
  const summary = endpoint.summary?.trim().replace(/\.$/, '');
  if (summary) {
    return `I want to ${summary.toLowerCase()} using ${node.id} (${endpoint.method} ${endpoint.path}). Ask one clarifying question, then draft the exact call.`;
  }
  return `Help me call ${endpoint.method} ${endpoint.path} from contract ${node.id}.`;
}

function openAssistantWithPrompt(prompt: string) {
  const text = prompt.trim();
  if (!text) return;

  try {
    sessionStorage.setItem(AI_ASSISTANT_DRAFT_KEY, text);
  } catch { /* ignore */ }

  try {
    window.dispatchEvent(new CustomEvent(AI_ASSISTANT_INJECT_PROMPT_EVENT, {
      detail: { prompt: text, mode: 'replace' },
    }));
  } catch { /* ignore */ }

  openWorkspacePanel('ai-assistant');
}

// =============================================================================
// Contract Graph View
// =============================================================================

function ContractGraphView() {
  const [data, setData] = useState<ContractsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEndpointContracts, setExpandedEndpointContracts] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await pixsimClient.get<ContractsResponse>('/meta/contracts');
      setData(res);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  const toggleEndpoints = useCallback((contractId: string) => {
    setExpandedEndpointContracts((prev) => {
      const next = new Set(prev);
      if (next.has(contractId)) next.delete(contractId);
      else next.add(contractId);
      return next;
    });
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Loading contract graph..." icon={<Icon name="loader" size={20} />} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 space-y-4">
      <SectionHeader
        trailing={
          <div className="flex items-center gap-2">
            <Badge color={data.total_active_agents > 0 ? 'green' : 'gray'}>
              {data.total_active_agents} active agent{data.total_active_agents !== 1 ? 's' : ''}
            </Badge>
            <Button size="sm" variant="ghost" onClick={load}>Refresh</Button>
          </div>
        }
      >
        Contract Graph
      </SectionHeader>

      <div className="space-y-3">
        {data.contracts.map((node) => {
          const endpointEntries = getEndpointEntries(node);
          const endpointCount = endpointEntries.length;
          const endpointsExpanded = expandedEndpointContracts.has(node.id);

          return (
            <div
              key={node.id}
              className={`rounded-lg border overflow-hidden ${
                node.active_agents.length > 0
                  ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20'
                  : 'border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{node.name}</span>
                  <Badge color="gray" className="text-[10px]">{node.id}</Badge>
                  {node.active_agents.length > 0 && (
                    <Badge color="green" className="text-[10px]">
                      {node.active_agents.length} agent{node.active_agents.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-neutral-400">
                  v{node.version} | {endpointCount} endpoint{endpointCount !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                {node.summary}
              </div>

              {endpointCount > 0 && (
                <div className="px-4 pb-2">
                  <button
                    onClick={() => toggleEndpoints(node.id)}
                    className="w-full px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 text-left text-[11px] bg-neutral-50/70 dark:bg-neutral-900/40 hover:bg-neutral-100 dark:hover:bg-neutral-900/60 transition-colors flex items-center gap-2"
                  >
                    <Icon name={endpointsExpanded ? 'chevronDown' : 'chevronRight'} size={12} className="text-neutral-500" />
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {endpointCount} endpoint{endpointCount !== 1 ? 's' : ''}
                    </span>
                    <span className="ml-auto text-[10px] text-neutral-500 dark:text-neutral-400">
                      {endpointsExpanded ? 'hide' : 'show'}
                    </span>
                  </button>

                  {endpointsExpanded && (
                    <div className="mt-2 space-y-1">
                      {endpointEntries.map((entry) => {
                        const viewTarget = getEndpointViewTarget(entry.path, entry.method);
                        return (
                          <div
                            key={entry.key}
                            className="w-full px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 text-[11px] bg-neutral-50/70 dark:bg-neutral-900/40 flex items-center gap-2"
                          >
                            <Badge color="gray" className="text-[9px] shrink-0">{entry.method}</Badge>
                            <span className="font-mono text-[10px] text-neutral-600 dark:text-neutral-300 truncate max-w-[40%]">
                              {entry.path}
                            </span>
                            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                              {entry.summary}
                            </span>
                            <div className="ml-auto flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => openEndpointView(entry.path, entry.method)}
                                className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 text-[10px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                title={viewTarget.label === 'Docs' ? 'Open API docs' : 'Open endpoint'}
                              >
                                {viewTarget.label}
                              </button>
                              <button
                                onClick={() => openAssistantWithPrompt(
                                  entry.endpoint ? buildContractPrompt(node, entry.endpoint) : buildContractPrompt(node)
                                )}
                                className="px-2 py-0.5 rounded border border-blue-300 dark:border-blue-700 text-[10px] text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                title="Open in AI Assistant"
                              >
                                Ask
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {node.provides.length > 0 && (
                <div className="px-4 pb-2 flex flex-wrap gap-1">
                  {node.provides.map((cap) => (
                    <Badge key={cap} color="blue" className="text-[9px]">{cap}</Badge>
                  ))}
                </div>
              )}

              {node.relates_to.length > 0 && (
                <div className="px-4 pb-2 flex items-center gap-1 text-[10px] text-neutral-400">
                  <Icon name="arrowRightLeft" size={10} />
                  {node.relates_to.join(', ')}
                </div>
              )}

              {node.active_agents.map((agent) => (
                <div
                  key={agent.session_id}
                  className="mx-3 mb-2 px-3 py-2 rounded border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Badge color="green" className="text-[10px]">{agent.agent_type}</Badge>
                    <span className="font-medium">{agent.action || 'idle'}</span>
                    <span className="text-neutral-400 ml-auto">{formatDuration(agent.duration_seconds)}</span>
                  </div>
                  {agent.detail && (
                    <div className="text-neutral-500 mt-1">{agent.detail}</div>
                  )}
                  {agent.plan_id && (
                    <div className="text-neutral-400 mt-0.5">Plan: <PlanLink planId={agent.plan_id} /></div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Active Sessions View (sessions + bridges combined)
// =============================================================================

interface BridgeAgent {
  agent_id: string;
  agent_type: string;
  user_id: number | null;
  connected_at: string;
  busy: boolean;
  tasks_completed: number;
}

interface BridgeStatusResponse {
  connected: number;
  available: number;
  agents: BridgeAgent[];
}

interface StartBridgeResponse {
  ok: boolean;
  pid: number | null;
  message: string;
}

interface CliTokenResponse {
  token: string;
  expires_in_hours: number;
  scope: string;
  command: string;
}

const MODELS = [
  { id: 'sonnet', label: 'Sonnet', desc: 'Fast, good balance' },
  { id: 'opus', label: 'Opus', desc: 'Most capable' },
  { id: 'haiku', label: 'Haiku', desc: 'Fastest, lightweight' },
] as const;

function ActiveSessionsView() {
  const [sessions, setSessions] = useState<AgentSessionsResponse | null>(null);
  const [bridges, setBridges] = useState<BridgeStatusResponse | null>(null);
  const [bridgeAction, setBridgeAction] = useState('');
  const [cliToken, setCliToken] = useState<CliTokenResponse | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Bridge config
  const [poolSize, setPoolSize] = useState(1);
  const [model, setModel] = useState('sonnet');
  const [skipPermissions, setSkipPermissions] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([
        pixsimClient.get<AgentSessionsResponse>('/meta/agents').catch(() => null),
        pixsimClient.get<BridgeStatusResponse>('/meta/agents/bridge').catch(() => null),
      ]);
      setSessions(s);
      setBridges(b);
    } catch { /* ignore */ }
  }, []);

  const startServerBridge = useCallback(async () => {
    setBridgeAction('starting');
    try {
      const args = [`--model ${model}`];
      if (skipPermissions) args.push('--dangerously-skip-permissions');
      const res = await pixsimClient.post<StartBridgeResponse>('/meta/agents/bridge/start', {
        pool_size: poolSize,
        claude_args: args.join(' '),
      });
      setBridgeAction(res.message);
      setTimeout(() => { void load(); setBridgeAction(''); }, 3000);
    } catch (e) {
      setBridgeAction(e instanceof Error ? e.message : 'Failed');
    }
  }, [load, poolSize, model, skipPermissions]);

  const stopServerBridge = useCallback(async () => {
    setBridgeAction('stopping');
    try {
      const res = await pixsimClient.post<StartBridgeResponse>('/meta/agents/bridge/stop');
      setBridgeAction(res.message);
      setTimeout(() => { void load(); setBridgeAction(''); }, 2000);
    } catch (e) {
      setBridgeAction(e instanceof Error ? e.message : 'Failed');
    }
  }, [load]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleTerminate = useCallback(async (agentId: string) => {
    try {
      await pixsimClient.post(`/meta/agents/bridge/${agentId}/terminate`);
      void load();
    } catch { /* ignore */ }
  }, [load]);

  const generateCliToken = useCallback(async () => {
    try {
      const res = await pixsimClient.post<CliTokenResponse>(
        '/meta/agents/cli-token',
        undefined,
        { params: { scope: 'dev', hours: 48 } },
      );
      setCliToken(res);
      setTokenCopied(false);
    } catch { /* ignore */ }
  }, []);

  const copyCommand = useCallback(() => {
    if (!cliToken) return;
    navigator.clipboard.writeText(cliToken.command).then(() => {
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    });
  }, [cliToken]);

  const bridgeAgents = bridges?.agents ?? [];
  // Filter out sessions that are already shown as bridge agents (same agent_id)
  const bridgeAgentIds = new Set(bridgeAgents.map((a) => a.agent_id));
  const activeSessionList = (sessions?.active ?? []).filter((s) => !bridgeAgentIds.has(s.session_id));

  return (
    <div className="p-4 space-y-4">
      {/* Server bridge controls */}
      <SectionHeader>Server Bridge</SectionHeader>

      {bridgeAgents.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {/* Config row */}
          <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-900 space-y-2.5">
            {/* Model */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500 w-14 shrink-0">Model</span>
              <div className="flex gap-1">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`px-2 py-1 text-[11px] rounded transition-colors ${
                      model === m.id
                        ? 'bg-accent text-white'
                        : 'border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                    title={m.desc}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pool size */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500 w-14 shrink-0">Sessions</span>
              <div className="flex gap-1">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPoolSize(n)}
                    className={`w-7 h-7 text-[11px] rounded transition-colors ${
                      poolSize === n
                        ? 'bg-accent text-white'
                        : 'border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Skip permissions toggle */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500 w-14 shrink-0">Options</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipPermissions}
                  onChange={(e) => setSkipPermissions(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-neutral-300 accent-accent"
                />
                <span className="text-[11px] text-neutral-500">Skip permissions</span>
              </label>
            </div>
          </div>

          {/* Start button */}
          <div className="px-4 py-2.5 flex items-center justify-between">
            <span className="text-[10px] text-neutral-400">
              {poolSize} {model} session{poolSize > 1 ? 's' : ''}
            </span>
            <Button size="sm" onClick={startServerBridge} disabled={bridgeAction === 'starting'}>
              {bridgeAction === 'starting' ? 'Starting...' : 'Start Bridge'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Badge color="green" className="text-[10px]">
            {bridgeAgents.length} running
          </Badge>
          <div className="ml-auto">
            <Button size="sm" variant="ghost" onClick={stopServerBridge} disabled={bridgeAction === 'stopping'}>
              {bridgeAction === 'stopping' ? 'Stopping...' : 'Stop Bridge'}
            </Button>
          </div>
        </div>
      )}

      {bridgeAction && bridgeAction !== 'starting' && bridgeAction !== 'stopping' && (
        <div className="text-xs text-neutral-500">{bridgeAction}</div>
      )}

      {/* CLI Token */}
      <div className="flex items-center gap-2">
        <SectionHeader>CLI Token</SectionHeader>
        <div className="ml-auto">
          <Button size="sm" variant="ghost" onClick={generateCliToken}>
            <Icon name="key" size={12} className="mr-1" />
            Generate
          </Button>
        </div>
      </div>
      {cliToken && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge color="green" className="text-[10px]">scope: {cliToken.scope}</Badge>
              <span className="text-[10px] text-neutral-400">expires in {cliToken.expires_in_hours}h</span>
            </div>
            <Button size="sm" variant="ghost" onClick={copyCommand}>
              {tokenCopied ? 'Copied!' : 'Copy Command'}
            </Button>
          </div>
          <div className="px-4 py-2">
            <pre className="text-[10px] text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap break-all font-mono bg-neutral-100 dark:bg-neutral-900 rounded p-2">
              {cliToken.command}
            </pre>
          </div>
        </div>
      )}

      {/* Connected bridges */}
      {bridgeAgents.length > 0 && (
        <div>
          <SectionHeader>{bridgeAgents.length} Connected Bridge{bridgeAgents.length !== 1 ? 's' : ''}</SectionHeader>
          <div className="mt-2 space-y-2">
            {bridgeAgents.map((agent) => (
              <div key={agent.agent_id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge color={agent.busy ? 'orange' : 'green'} className="text-[10px]">
                      {agent.busy ? 'busy' : 'ready'}
                    </Badge>
                    <span className="font-mono text-xs">{agent.agent_id}</span>
                    <Badge color="gray" className="text-[10px]">{agent.agent_type}</Badge>
                    {agent.user_id != null ? (
                      <Badge color="purple" className="text-[10px]">user:{agent.user_id}</Badge>
                    ) : (
                      <Badge color="gray" className="text-[10px]">shared</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-400">{agent.tasks_completed} tasks</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleTerminate(agent.agent_id)}
                    >
                      Terminate
                    </Button>
                  </div>
                </div>
                {/* Show current activity from heartbeat session if available */}
                {(() => {
                  const session = (sessions?.active ?? []).find((s) => s.session_id === agent.agent_id);
                  if (!session || !session.current_action) return null;
                  return (
                    <div className="px-4 py-1.5 text-xs">
                      <span className="text-neutral-500">
                        {session.current_action === 'thinking' ? 'Thinking...' :
                         session.current_action === 'tool_use' ? session.current_detail :
                         session.current_action === 'streaming' ? 'Generating...' :
                         session.current_detail || session.current_action}
                      </span>
                    </div>
                  );
                })()}
                <div className="px-4 py-1.5 text-[10px] text-neutral-400">
                  Connected {formatTimestamp(agent.connected_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active heartbeat sessions */}
      {activeSessionList.length > 0 && (
        <div>
          <SectionHeader>{activeSessionList.length} Active Session{activeSessionList.length !== 1 ? 's' : ''}</SectionHeader>
          <div className="mt-2 space-y-2">
            {activeSessionList.map((session) => (
              <div key={session.session_id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge color={STATUS_COLORS[session.status] ?? 'gray'}>{session.status}</Badge>
                    <span className="font-mono text-xs">{session.session_id}</span>
                    <Badge color="gray" className="text-[10px]">{session.agent_type}</Badge>
                  </div>
                  <span className="text-[10px] text-neutral-400">{formatDuration(session.duration_seconds)}</span>
                </div>

                <div className="px-4 py-2 space-y-1 text-xs">
                  {session.current_action && (
                    <div>
                      <span className="text-neutral-500">Action: </span>
                      <span className="font-medium">{session.current_action}</span>
                    </div>
                  )}
                  {session.current_detail && (
                    <div className="text-neutral-500">{session.current_detail}</div>
                  )}
                  {session.current_contract_id && (
                    <div>
                      <span className="text-neutral-500">Contract: </span>
                      <Badge color="blue" className="text-[10px]">{session.current_contract_id}</Badge>
                    </div>
                  )}
                  {session.current_plan_id && (
                    <div>
                      <span className="text-neutral-500">Plan: </span>
                      <PlanLink planId={session.current_plan_id} />
                    </div>
                  )}
                </div>

                {session.recent_activity.length > 0 && (
                  <div className="px-4 pb-3">
                    <SectionHeader className="mb-1">Recent Activity</SectionHeader>
                    <div className="space-y-0.5 max-h-32 overflow-auto">
                      {session.recent_activity.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px] text-neutral-500">
                          <span className="text-neutral-400 w-16 shrink-0">{formatTimestamp(a.timestamp).split(', ').pop()}</span>
                          <span className="font-medium text-neutral-700 dark:text-neutral-300">{a.action}</span>
                          {a.detail && <span className="truncate">{a.detail}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// History View
// =============================================================================

function HistoryView() {
  const [data, setData] = useState<AgentHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pixsimClient
      .get<AgentHistoryResponse>('/meta/agents/history', { params: { limit: 100 } })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Loading history..." icon={<Icon name="loader" size={20} />} />
      </div>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="No agent activity recorded yet" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <SectionHeader>{data.total} total entries (showing {data.entries.length})</SectionHeader>
      <div className="space-y-1">
        {data.entries.map((entry, i) => (
          <div
            key={`${entry.session_id}-${entry.timestamp}-${i}`}
            className="flex items-start gap-2 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-800 text-xs"
          >
            <Badge color={STATUS_COLORS[entry.status] ?? 'gray'} className="text-[10px] shrink-0">
              {entry.action || entry.status}
            </Badge>
            <div className="flex-1 min-w-0">
              <span className="font-mono text-neutral-500">{entry.session_id.slice(0, 16)}</span>
              {entry.contract_id && (
                <Badge color="blue" className="text-[9px] ml-1">{entry.contract_id}</Badge>
              )}
              {entry.plan_id && (
                <span className="ml-1"><PlanLink planId={entry.plan_id} /></span>
              )}
              {entry.detail && (
                <div className="text-neutral-500 truncate mt-0.5">{entry.detail}</div>
              )}
            </div>
            <span className="shrink-0 text-neutral-400 text-[10px]">{formatTimestamp(entry.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Writes View — plan changes attributed to agents
// =============================================================================

interface AgentWriteEntry {
  id: string;
  plan_id: string;
  plan_title: string;
  event_type: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  commit_sha: string | null;
  actor: string;
  timestamp: string;
}

interface AgentWritesResponse {
  entries: AgentWriteEntry[];
  total: number;
}

function WritesView() {
  const [data, setData] = useState<AgentWritesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pixsimClient
      .get<AgentWritesResponse>('/meta/agents/writes', { params: { days: 14, limit: 100 } })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Loading writes..." icon={<Icon name="loader" size={20} />} />
      </div>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="No agent-attributed writes yet" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <SectionHeader>{data.total} agent write{data.total !== 1 ? 's' : ''} (last 14 days)</SectionHeader>
      <div className="space-y-1">
        {data.entries.map((entry) => {
          const agentName = entry.actor.replace('agent:', '');
          const isFieldChange = entry.event_type === 'field_changed';
          return (
            <div
              key={entry.id}
              className="flex items-start gap-2 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-800 text-xs"
            >
              <Badge color="blue" className="text-[10px] shrink-0">{agentName}</Badge>
              <div className="flex-1 min-w-0">
                <span className="mr-1"><PlanLink planId={entry.plan_id} /></span>
                {isFieldChange && entry.field && (
                  <span className="text-neutral-500">
                    {entry.field}
                    {entry.new_value ? ` \u2192 ${entry.new_value.slice(0, 40)}` : ''}
                  </span>
                )}
                {!isFieldChange && (
                  <Badge color="gray" className="text-[9px] ml-1">{entry.event_type}</Badge>
                )}
                {entry.commit_sha && (
                  <span className="ml-1 font-mono text-neutral-400 text-[10px]">
                    {entry.commit_sha.slice(0, 7)}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-neutral-400 text-[10px]">{formatTimestamp(entry.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Stats View
// =============================================================================

function StatsView() {
  const [data, setData] = useState<AgentStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pixsimClient
      .get<AgentStatsResponse>('/meta/agents/stats', { params: { days: 7 } })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Loading stats..." icon={<Icon name="loader" size={20} />} />
      </div>
    );
  }

  if (!data || data.total_heartbeats === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="No agent stats yet" description="Stats accumulate as agents report heartbeats" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <SectionHeader>Last 7 Days</SectionHeader>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Total Heartbeats" value={data.total_heartbeats} />
        <StatCard label="Unique Sessions" value={data.unique_sessions} />
      </div>

      {data.by_contract.length > 0 && (
        <div>
          <SectionHeader>By Contract</SectionHeader>
          <div className="mt-2 space-y-1">
            {data.by_contract.map((c) => (
              <div key={c.contract_id} className="flex items-center justify-between px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-800 text-xs">
                <Badge color="blue" className="text-[10px]">{c.contract_id}</Badge>
                <div className="flex gap-3 text-neutral-500">
                  <span>{c.heartbeat_count} heartbeats</span>
                  <span>{c.unique_sessions} sessions</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.by_plan.length > 0 && (
        <div>
          <SectionHeader>By Plan</SectionHeader>
          <div className="mt-2 space-y-1">
            {data.by_plan.map((p) => (
              <div key={p.plan_id} className="flex items-center justify-between px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-800 text-xs">
                <PlanLink planId={p.plan_id} />
                <div className="flex gap-3 text-neutral-500">
                  <span>{p.heartbeat_count} heartbeats</span>
                  <span>{p.unique_sessions} sessions</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Send Message View
// =============================================================================

interface ChatMessage {
  role: 'user' | 'agent' | 'error';
  text: string;
  agent_id?: string;
  duration_ms?: number;
  timestamp: Date;
}

interface BridgeStatus {
  connected: number;
  available: number;
  agents: { agent_id: string; agent_type: string; busy: boolean; tasks_completed: number }[];
}

interface SendMessageApiResponse {
  ok: boolean;
  agent_id: string;
  response: string | null;
  error: string | null;
  duration_ms: number | null;
}

function SendMessageView() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const messagesEndRef = useCallback((el: HTMLDivElement | null) => {
    el?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Poll bridge status
  useEffect(() => {
    const load = () => {
      pixsimClient
        .get<BridgeStatus>('/meta/agents/bridge')
        .then(setBridge)
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 5_000);
    return () => clearInterval(interval);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text, timestamp: new Date() }]);
    setSending(true);

    try {
      const res = await pixsimClient.post<SendMessageApiResponse>('/meta/agents/bridge/send', {
        message: text,
        timeout: 120,
      });

      if (res.ok && res.response) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'agent',
            text: res.response!,
            agent_id: res.agent_id,
            duration_ms: res.duration_ms ?? undefined,
            timestamp: new Date(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'error', text: res.error || 'No response', timestamp: new Date() },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', text: err instanceof Error ? err.message : 'Request failed', timestamp: new Date() },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [send],
  );

  const connected = bridge?.connected ?? 0;
  const available = bridge?.available ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Bridge status */}
      <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
        <Badge color={connected > 0 ? 'green' : 'red'}>
          {connected > 0 ? `${available}/${connected} available` : 'No agents connected'}
        </Badge>
        {bridge?.agents.map((a) => (
          <Badge key={a.agent_id} color={a.busy ? 'orange' : 'gray'} className="text-[10px]">
            {a.agent_id.slice(0, 12)} ({a.agent_type})
          </Badge>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <EmptyState
            message={connected > 0 ? 'Send a message to test the agent bridge' : 'Connect an agent first'}
            description={connected > 0 ? undefined : 'Run: python scripts/agent_bridge.py'}
            size="sm"
          />
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : msg.role === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
              }`}
            >
              <pre className="whitespace-pre-wrap text-xs font-sans">{msg.text}</pre>
              {msg.role === 'agent' && (
                <div className="flex gap-2 mt-1 text-[10px] opacity-60">
                  {msg.agent_id && <span>{msg.agent_id}</span>}
                  {msg.duration_ms != null && <span>{(msg.duration_ms / 1000).toFixed(1)}s</span>}
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected > 0 ? 'Type a message... (Enter to send)' : 'No agent connected'}
            disabled={connected === 0 || sending}
            rows={2}
            className="flex-1 px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <Button
            size="sm"
            onClick={send}
            disabled={connected === 0 || sending || !input.trim()}
          >
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AgentObservabilityPanel() {
  const { theme: variant } = useTheme();

  const sections = useMemo<SidebarContentLayoutSection[]>(() => [
    {
      id: 'graph',
      label: 'Contract Graph',
      icon: <Icon name="graph" size={12} />,
    },
    {
      id: 'sessions',
      label: 'Active Sessions',
      icon: <Icon name="activity" size={12} />,
    },
    {
      id: 'history',
      label: 'History',
      icon: <Icon name="clock" size={12} />,
    },
    {
      id: 'writes',
      label: 'Writes',
      icon: <Icon name="edit" size={12} />,
    },
    {
      id: 'send',
      label: 'Test Bridge',
      icon: <Icon name="messageSquare" size={12} />,
    },
    {
      id: 'stats',
      label: 'Stats',
      icon: <Icon name="barChart" size={12} />,
    },
  ], []);

  const nav = useSidebarNav({
    sections,
    initial: 'graph',
    storageKey: 'agent-observability:nav',
  });

  let content: React.ReactNode;
  switch (nav.activeId) {
    case 'graph':
      content = <ContractGraphView />;
      break;
    case 'sessions':
      content = <ActiveSessionsView />;
      break;
    case 'history':
      content = <HistoryView />;
      break;
    case 'writes':
      content = <WritesView />;
      break;
    case 'send':
      content = <SendMessageView />;
      break;
    case 'stats':
      content = <StatsView />;
      break;
    default:
      content = (
        <div className="flex items-center justify-center h-full">
          <EmptyState message="Select a view" />
        </div>
      );
  }

  return (
    <SidebarContentLayout
      sections={sections}
      activeSectionId={nav.activeSectionId}
      onSelectSection={nav.selectSection}
      variant={variant}
      collapsible
      expandedWidth={160}
      persistKey="agent-observability-sidebar"
      contentClassName="overflow-y-auto"
    >
      {content}
    </SidebarContentLayout>
  );
}
