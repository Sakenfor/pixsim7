/**
 * AgentObservabilityPanel - AI agent activity dashboard
 *
 * Shows the contract graph with live agent presence, session history,
 * and utilization stats. Uses /meta/contracts, /meta/agents, /meta/agents/history, /meta/agents/stats.
 */

import {
  Badge,
  Button,
  ConfirmModal,
  EmptyState,
  FilterPillGroup,
  FoldableJson,
  Modal,
  SectionHeader,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  StatCard,
  ToolbarToggleButton,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';
import { formatActorLabel } from '@lib/identity/actorDisplay';

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
  plan_id: string | null;
  contract_id: string | null;
  action: string;
  detail: string;
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

/** Lightweight markdown renderer for work summaries. */
function FormattedSummary({ text, className }: { text: string; className?: string }) {
  const nodes = useMemo(() => {
    const lines = text.split('\n');
    const result: React.ReactNode[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      // Headings
      const hm = line.match(/^(#{1,3})\s+(.+)/);
      if (hm) {
        const cls = hm[1].length === 1 ? 'font-bold' : hm[1].length === 2 ? 'font-semibold' : 'font-medium';
        result.push(<div key={result.length} className={cls}>{summaryInline(hm[2])}</div>);
        i++; continue;
      }

      // Bullet list
      if (line.match(/^\s*[-*]\s/)) {
        const items: string[] = [];
        while (i < lines.length && lines[i].match(/^\s*[-*]\s/)) { items.push(lines[i].replace(/^\s*[-*]\s/, '')); i++; }
        result.push(<ul key={result.length} className="list-disc pl-4 space-y-0.5">{items.map((it, j) => <li key={j}>{summaryInline(it)}</li>)}</ul>);
        continue;
      }

      // Numbered list (1. or (1))
      if (line.match(/^\s*(\d+[.)]\s|\(\d+\)\s)/)) {
        const items: string[] = [];
        while (i < lines.length && lines[i].match(/^\s*(\d+[.)]\s|\(\d+\)\s)/)) {
          items.push(lines[i].replace(/^\s*(\d+[.)]\s|\(\d+\)\s)/, '')); i++;
        }
        result.push(<ol key={result.length} className="list-decimal pl-4 space-y-0.5">{items.map((it, j) => <li key={j}>{summaryInline(it)}</li>)}</ol>);
        continue;
      }

      // Paragraph — also handle inline (1), (2) patterns
      const expanded = line.replace(/\s*\((\d+)\)\s*/g, '\n($1) ').trim();
      if (expanded.includes('\n')) {
        const sublines = expanded.split('\n');
        result.push(<div key={result.length} className="space-y-0.5">{sublines.map((sl, j) => <div key={j}>{summaryInline(sl)}</div>)}</div>);
      } else {
        result.push(<p key={result.length}>{summaryInline(line)}</p>);
      }
      i++;
    }
    return result;
  }, [text]);

  return <div className={`${className ?? ''} space-y-1`}>{nodes}</div>;
}

function summaryInline(text: string): React.ReactNode {
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) parts.push(<strong key={parts.length}>{match[2]}</strong>);
    else if (match[3]) parts.push(<code key={parts.length} className="px-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-[10px] font-mono">{match[3]}</code>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? <>{parts}</> : text;
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

interface PoolSession {
  session_id: string;
  engine: string;
  state: string;
  cli_session_id: string | null;
  cli_model: string | null;
  messages_sent: number;
  messages_received: number;
  errors: number;
  total_duration_ms: number;
  started_at: string | null;
  last_activity: string | null;
  last_error: string | null;
  pid: number | null;
  context_window: number;
  total_tokens: number;
  context_pct: number | null;
  cost_usd: number | null;
}

interface BridgeAgent {
  bridge_client_id: string;
  agent_type: string;
  user_id: number | null;
  connected_at: string;
  busy: boolean;
  tasks_completed: number;
  engines: string[];
  pool_sessions: PoolSession[];
}

interface BridgeStatusResponse {
  connected: number;
  available: number;
  agents: BridgeAgent[];
}

interface BridgeMachine {
  bridge_client_id: string;
  bridge_id: string | null;
  agent_type: string | null;
  status: string;
  online: boolean;
  first_seen_at: string;
  last_seen_at: string;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  model: string | null;
  client_host: string | null;
}

interface BridgeMachinesResponse {
  total: number;
  machines: BridgeMachine[];
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ActiveSessionsView() {
  const [sessions, setSessions] = useState<AgentSessionsResponse | null>(null);
  const [bridges, setBridges] = useState<BridgeStatusResponse | null>(null);
  const [bridgeMachines, setBridgeMachines] = useState<BridgeMachinesResponse | null>(null);
  const [bridgeAction, setBridgeAction] = useState('');
  const [cliToken, setCliToken] = useState<CliTokenResponse | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Bridge config
  const [poolSize] = useState(1);
  const [skipPermissions, setSkipPermissions] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, b, m] = await Promise.all([
        pixsimClient.get<AgentSessionsResponse>('/meta/agents').catch(() => null),
        pixsimClient.get<BridgeStatusResponse>('/meta/agents/bridge').catch(() => null),
        pixsimClient.get<BridgeMachinesResponse>('/meta/agents/bridge/machines').catch(() => null),
      ]);
      setSessions(s);
      setBridges(b);
      setBridgeMachines(m);
    } catch { /* ignore */ }
  }, []);

  const startServerBridge = useCallback(async () => {
    setBridgeAction('starting');
    try {
      const extraArgs = skipPermissions ? '--dangerously-skip-permissions' : undefined;
      const res = await pixsimClient.post<StartBridgeResponse>('/meta/agents/bridge/start', {
        pool_size: poolSize,
        extra_args: extraArgs,
      });
      setBridgeAction(res.message);
      setTimeout(() => { void load(); setBridgeAction(''); }, 3000);
    } catch (e) {
      setBridgeAction(e instanceof Error ? e.message : 'Failed');
    }
  }, [load, poolSize, skipPermissions]);

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

  const handleTerminate = useCallback(async (bridgeClientId: string) => {
    try {
      await pixsimClient.post(`/meta/agents/bridge/${bridgeClientId}/terminate`);
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
  // Filter out sessions that are already shown as bridge agents (same bridge client id)
  const bridgeAgentIds = new Set(bridgeAgents.map((a) => a.bridge_client_id));
  const activeSessionList = (sessions?.active ?? []).filter((s) => !bridgeAgentIds.has(s.session_id));
  const knownMachines = bridgeMachines?.machines ?? [];

  return (
    <div className="p-4 space-y-4">
      {/* Server bridge controls */}
      <SectionHeader>Server Bridge</SectionHeader>

      {bridgeAgents.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-900 space-y-2.5">
            <div className="text-[11px] text-neutral-500">
              Auto-detects available engines (claude, codex). Sessions spawn on demand.
            </div>

            {/* Skip permissions toggle */}
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

          <div className="px-4 py-2.5 flex items-center justify-end">
            <Button size="sm" onClick={startServerBridge} disabled={bridgeAction === 'starting'}>
              {bridgeAction === 'starting' ? 'Starting...' : 'Start Bridge'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge color="green" className="text-[10px]">connected</Badge>
            {bridgeAgents.map((a) => (
              <div key={a.bridge_client_id} className="flex items-center gap-1.5">
                {a.engines.map((e) => (
                  <Badge key={e} color={e === 'claude' ? 'blue' : e === 'codex' ? 'purple' : 'gray'} className="text-[10px]">{e}</Badge>
                ))}
                <span className="text-[10px] text-neutral-400">
                  {a.tasks_completed} task{a.tasks_completed !== 1 ? 's' : ''} · {a.pool_sessions.length} session{a.pool_sessions.length !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
            <div className="ml-auto">
              <Button size="sm" variant="ghost" onClick={stopServerBridge} disabled={bridgeAction === 'stopping'}>
                {bridgeAction === 'stopping' ? 'Stopping...' : 'Stop'}
              </Button>
            </div>
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
              <div key={agent.bridge_client_id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {agent.engines.map((e) => (
                      <Badge key={e} color={e === 'claude' ? 'blue' : e === 'codex' ? 'purple' : 'gray'} className="text-[10px]">{e}</Badge>
                    ))}
                    {agent.user_id != null ? (
                      <Badge color="purple" className="text-[10px]">user:{agent.user_id}</Badge>
                    ) : (
                      <Badge color="gray" className="text-[10px]">shared</Badge>
                    )}
                    <span className="text-[10px] text-neutral-400">
                      up {formatTimestamp(agent.connected_at)} · {agent.tasks_completed} task{agent.tasks_completed !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => void handleTerminate(agent.bridge_client_id)}>
                    Terminate
                  </Button>
                </div>

                {/* Pool sessions */}
                {agent.pool_sessions.length > 0 ? (
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {agent.pool_sessions.map((ps) => {
                      const engine = ps.session_id.split('-')[0] || 'unknown';
                      const engineColor = engine === 'claude' ? 'blue' : engine === 'codex' ? 'purple' : 'gray';
                      return (
                        <div key={ps.session_id} className="px-4 py-2 flex items-center gap-2 text-[10px]">
                          <Badge color={ps.state === 'ready' ? 'green' : ps.state === 'busy' ? 'orange' : ps.state === 'errored' ? 'red' : 'gray'} className="text-[9px] min-w-[38px] text-center">
                            {ps.state}
                          </Badge>
                          <Badge color={engineColor} className="text-[9px]">{engine}</Badge>
                          {ps.cli_model && (
                            <span className="text-neutral-500 font-medium">{ps.cli_model}</span>
                          )}
                          <span className="text-neutral-400">
                            {ps.messages_sent}/{ps.messages_received} msg
                          </span>
                          {ps.errors > 0 && (
                            <span className="text-red-400" title={ps.last_error || undefined}>{ps.errors} err</span>
                          )}
                          {ps.context_pct != null && (
                            <span
                              className={`font-mono ${ps.context_pct > 80 ? 'text-orange-400' : ps.context_pct > 50 ? 'text-yellow-400' : 'text-neutral-400'}`}
                              title={`${ps.total_tokens.toLocaleString()} / ${ps.context_window.toLocaleString()} tokens${ps.cost_usd ? ` · $${ps.cost_usd.toFixed(3)}` : ''}`}
                            >
                              ctx {ps.context_pct}%
                            </span>
                          )}
                          {ps.cost_usd != null && ps.cost_usd > 0 && ps.context_pct == null && (
                            <span className="text-neutral-400">${ps.cost_usd.toFixed(3)}</span>
                          )}
                          {ps.last_activity && (
                            <span className="text-neutral-400 ml-auto">{formatTimestamp(ps.last_activity)}</span>
                          )}
                          {ps.pid && (
                            <span className="text-neutral-300 dark:text-neutral-600 font-mono" title={`PID: ${ps.pid}\nSession: ${ps.cli_session_id || '—'}`}>
                              :{ps.pid}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-2 text-[10px] text-neutral-400">
                    On-demand — sessions spawn when needed
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {knownMachines.length > 0 && (
        <div>
          <SectionHeader>{knownMachines.length} Known Machine{knownMachines.length !== 1 ? 's' : ''}</SectionHeader>
          <div className="mt-2 space-y-1">
            {knownMachines.map((m) => (
              <div key={m.bridge_client_id} className="px-3 py-2 rounded border border-neutral-200 dark:border-neutral-800 text-[10px] flex items-center gap-2">
                <Badge color={m.online ? 'green' : 'gray'} className="text-[9px] min-w-[44px] text-center">
                  {m.online ? 'online' : 'offline'}
                </Badge>
                <span className="font-mono text-neutral-500">{m.bridge_client_id}</span>
                {m.agent_type && (
                  <Badge color={m.agent_type === 'claude' ? 'blue' : m.agent_type === 'codex' ? 'purple' : 'gray'} className="text-[9px]">
                    {m.agent_type}
                  </Badge>
                )}
                {m.client_host && <span className="text-neutral-400">{m.client_host}</span>}
                {m.model && <span className="text-neutral-400 truncate max-w-[180px]">{m.model}</span>}
                <span className="ml-auto text-neutral-400">{formatTimestamp(m.last_seen_at)}</span>
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
                    <Badge color={session.agent_type === 'claude' ? 'blue' : session.agent_type === 'codex' ? 'purple' : 'gray'} className="text-[10px]">{session.agent_type}</Badge>
                    <span className="font-mono text-[10px] text-neutral-400">{session.session_id.slice(0, 12)}</span>
                  </div>
                  <span className="text-[10px] text-neutral-400">{formatDuration(session.duration_seconds)}</span>
                </div>

                <div className="px-4 py-2 space-y-1 text-xs">
                  {session.action && (
                    <div>
                      <span className="text-neutral-500">Action: </span>
                      <span className="font-medium">{session.action}</span>
                    </div>
                  )}
                  {session.detail && (
                    <div className="text-neutral-500">{session.detail}</div>
                  )}
                  {(session.contract_id || session.plan_id) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {session.contract_id && (
                        <Badge color="blue" className="text-[9px]">{session.contract_id}</Badge>
                      )}
                      {session.plan_id && (
                        <Badge color="green" className="text-[9px]">plan:{session.plan_id}</Badge>
                      )}
                    </div>
                  )}
                </div>

                {(session.recent_activity?.length ?? 0) > 0 && (
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

const ACTION_ICONS: Record<string, import('@lib/icons').IconName> = {
  work_summary: 'fileText',
  tool_use: 'wrench',
  checkpoint_progress: 'checkCircle',
  plan_update: 'edit',
  review_comment: 'messageSquare',
  agent_response: 'messageSquare',
  created: 'plus',
  updated: 'edit',
  deleted: 'trash2',
  status_changed: 'refreshCw',
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
  work_summary: 'Summary',
  tool_use: 'Tool Use',
  checkpoint_progress: 'Progress',
  plan_update: 'Plan Update',
  review_comment: 'Review',
  agent_response: 'Response',
};

function HistoryEntryRow({ entry, allEntries }: {
  entry: AgentHistoryEntry;
  allEntries: AgentHistoryEntry[];
}) {
  const [expanded, setExpanded] = useState(false);

  // Session timeline: other entries with the same session_id
  const sessionTimeline = useMemo(() => {
    if (!expanded) return [];
    return allEntries.filter((e) => e.session_id === entry.session_id);
  }, [expanded, entry.session_id, allEntries]);

  const handleResume = useCallback(() => {
    // Store the session_id so the AI Assistant panel can resume it
    try {
      const tabId = `tab-resume-${Date.now().toString(36)}`;
      const tab = {
        id: tabId,
        label: entry.detail?.slice(0, 30) || entry.action || 'Resumed',
        sessionId: entry.session_id,
        profileId: null,
        engine: entry.agent_type === 'codex' ? 'codex' : 'claude',
        modelOverride: null,
        usePersona: true,
        customInstructions: '',
        focusAreas: [],
        injectToken: false,
        createdAt: new Date().toISOString(),
      };
      // Prepend to saved tabs
      const raw = localStorage.getItem('ai-assistant:tabs');
      const tabs = raw ? JSON.parse(raw) : [];
      tabs.unshift(tab);
      localStorage.setItem('ai-assistant:tabs', JSON.stringify(tabs.slice(0, 20)));
      localStorage.setItem('ai-assistant:active-tab', tabId);
    } catch { /* ignore */ }
    openWorkspacePanel('ai-assistant');
  }, [entry]);

  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-800">
      {/* Clickable row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 px-2 py-1.5 text-xs text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
      >
        <Icon name={ACTION_ICONS[entry.action] ?? 'activity'} size={12} className={`shrink-0 mt-0.5 ${entry.agent_type === 'claude' ? 'text-blue-400' : entry.agent_type === 'codex' ? 'text-violet-400' : 'text-neutral-400'}`} />
        <Badge color={STATUS_COLORS[entry.status] ?? 'gray'} className="text-[10px] shrink-0">
          {HISTORY_ACTION_LABELS[entry.action] || entry.action || entry.status}
        </Badge>
        <div className="flex-1 min-w-0">
          {(entry.contract_id || entry.plan_id) && (
            <div className="flex flex-wrap items-center gap-1">
              {entry.contract_id && (
                <Badge color="blue" className="text-[9px]">{entry.contract_id}</Badge>
              )}
              {entry.plan_id && (
                <Badge color="green" className="text-[9px]">plan:{entry.plan_id}</Badge>
              )}
            </div>
          )}
          {entry.detail && (
            expanded && entry.action === 'work_summary'
              ? <FormattedSummary text={entry.detail} className="text-neutral-500 mt-0.5 text-xs" />
              : <div className={`text-neutral-500 mt-0.5 ${expanded ? '' : 'truncate'}`}>{entry.detail}</div>
          )}
        </div>
        <span className="shrink-0 text-neutral-400 text-[10px]">{formatTimestamp(entry.timestamp)}</span>
        <Icon name="chevronRight" size={10} className={`shrink-0 text-neutral-400 transition-transform mt-0.5 ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 px-2 py-2 space-y-2">
          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={handleResume}>
              <Icon name="messageSquare" size={11} className="mr-1" />Resume Chat
            </Button>
            <button
              onClick={() => navigator.clipboard.writeText(entry.session_id)}
              className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 flex items-center gap-0.5"
              title="Copy session ID"
            >
              <Icon name="copy" size={10} />
              {entry.session_id.slice(0, 12)}
            </button>
          </div>

          {/* Session timeline */}
          {sessionTimeline.length > 1 && (
            <div>
              <SectionHeader className="mb-1">Session Timeline ({sessionTimeline.length} entries)</SectionHeader>
              <div className="space-y-0.5 max-h-[200px] overflow-y-auto pl-2 border-l-2 border-neutral-200 dark:border-neutral-700">
                {sessionTimeline.map((e, i) => {
                  const isCurrent = e.timestamp === entry.timestamp && e.action === entry.action;
                  return (
                    <div
                      key={`${e.timestamp}-${i}`}
                      className={`flex items-start gap-2 py-0.5 text-[11px] ${isCurrent ? 'text-accent font-medium' : 'text-neutral-500'}`}
                    >
                      <span className="text-neutral-400 w-20 shrink-0 text-[10px]">
                        {formatTimestamp(e.timestamp).split(', ').pop()}
                      </span>
                      <Badge color={STATUS_COLORS[e.status] ?? 'gray'} className="text-[9px] shrink-0">
                        {e.action || e.status}
                      </Badge>
                      <span className="truncate flex-1">{e.detail || ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryView() {
  const [data, setData] = useState<AgentHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  useEffect(() => {
    pixsimClient
      .get<AgentHistoryResponse>('/meta/agents/history', { params: { limit: 100 } })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const actionCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, number> = {};
    for (const e of data.entries) {
      const key = e.action || 'other';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [data]);

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    if (activeFilters.size === 0) return data.entries;
    return data.entries.filter((e) => activeFilters.has(e.action || 'other'));
  }, [data, activeFilters]);

  const toggleFilter = useCallback((action: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
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
      <div className="flex items-center gap-2 flex-wrap">
        <SectionHeader className="mr-auto">{filteredEntries.length} of {data.total} entries</SectionHeader>
        {Object.entries(actionCounts).map(([action, count]) => {
          const isActive = activeFilters.has(action);
          const icon = ACTION_ICONS[action] ?? 'activity';
          const label = HISTORY_ACTION_LABELS[action] || action;
          return (
            <button
              key={action}
              onClick={() => toggleFilter(action)}
              className={`flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 border transition-colors ${
                isActive
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                  : activeFilters.size > 0
                    ? 'border-neutral-200 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500'
                    : 'border-neutral-300 text-neutral-600 dark:border-neutral-600 dark:text-neutral-300'
              }`}
            >
              <Icon name={icon} size={10} />
              {label}
              <span className="text-[9px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="space-y-1">
        {filteredEntries.map((entry, i) => (
          <HistoryEntryRow
            key={`${entry.session_id}-${entry.timestamp}-${i}`}
            entry={entry}
            allEntries={data.entries}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Audit View — mutations attributed to agents across all domains
// =============================================================================

interface AgentWriteEntry {
  id: string;
  domain: string;
  entity_id: string;
  entity_label: string;
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

/** Try to parse a string as JSON, return parsed object or null */
function tryParseJson(value: string | null): unknown | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Produce a human-friendly summary of a value (for collapsed row) */
function summarizeValue(value: string | null): string {
  if (!value) return '';
  const parsed = tryParseJson(value);
  if (parsed !== null) {
    if (Array.isArray(parsed)) return `[${parsed.length} item${parsed.length !== 1 ? 's' : ''}]`;
    if (typeof parsed === 'object') {
      const keys = Object.keys(parsed as Record<string, unknown>);
      if (keys.length <= 3) return `{ ${keys.join(', ')} }`;
      return `{ ${keys.slice(0, 3).join(', ')}, \u2026 }`;
    }
  }
  if (value.length > 60) return value.slice(0, 57) + '\u2026';
  return value;
}

const ACTION_LABELS: Record<string, string> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  deactivated: 'deactivated',
  field_changed: 'updated',
  content_updated: 'updated',
  status_changed: 'updated',
};

const ACTION_BADGE_COLORS: Record<string, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  created: 'green',
  deleted: 'red',
  deactivated: 'orange',
};

/** True when value is short enough to show inline (e.g. "proposed → implementation-ready") */
function isInlineValue(value: string | null): boolean {
  if (!value) return false;
  return tryParseJson(value) === null && value.length <= 60;
}

function WriteEntryRow({
  entry,
  agentName,
}: {
  entry: AgentWriteEntry;
  agentName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const domainColor = entry.domain === 'plan' ? 'blue' : entry.domain === 'prompt' ? 'green' : 'gray';

  const hasExpandableContent =
    (entry.new_value && !isInlineValue(entry.new_value)) ||
    (entry.old_value && !isInlineValue(entry.old_value));

  const actionLabel = ACTION_LABELS[entry.event_type] || entry.event_type;
  const badgeColor = ACTION_BADGE_COLORS[entry.event_type] || 'gray';

  // Short inline transition: "proposed → implementation-ready"
  const showInlineTransition =
    !hasExpandableContent && entry.field && (isInlineValue(entry.old_value) || isInlineValue(entry.new_value));

  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-800 text-xs">
      {/* Summary row */}
      <div
        className={`flex items-start gap-2 px-2 py-1.5 ${hasExpandableContent ? 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40' : ''}`}
        onClick={hasExpandableContent ? () => setExpanded((p) => !p) : undefined}
      >
        <span className="shrink-0 text-neutral-400 text-[10px] mt-0.5 w-3 text-center select-none">
          {hasExpandableContent ? (expanded ? '\u25be' : '\u25b8') : ''}
        </span>
        <Badge color={domainColor} className="text-[10px] shrink-0">{agentName}</Badge>
        <div className="flex-1 min-w-0">
          {entry.domain === 'plan' ? (
            <span className="mr-1"><PlanLink planId={entry.entity_id} /></span>
          ) : (
            <span className="mr-1 text-neutral-600 dark:text-neutral-300">{entry.entity_label}</span>
          )}
          <Badge color={badgeColor} className="text-[9px] ml-0.5">{actionLabel}</Badge>
          {entry.field && (
            <span className="ml-1 text-neutral-500">{entry.field}</span>
          )}
          {showInlineTransition && (
            <span className="ml-1 text-neutral-400">
              {entry.old_value && <>{entry.old_value}</>}
              {entry.old_value && entry.new_value && ' \u2192 '}
              {!entry.old_value && entry.new_value && '\u2192 '}
              {entry.new_value && <span className="text-neutral-600 dark:text-neutral-300">{entry.new_value}</span>}
            </span>
          )}
          {!showInlineTransition && !expanded && hasExpandableContent && entry.new_value && (
            <span className="ml-1 text-neutral-400">{'\u2192 '}{summarizeValue(entry.new_value)}</span>
          )}
          {entry.commit_sha && (
            <span
              className="ml-1 font-mono text-blue-500 dark:text-blue-400 text-[10px] cursor-pointer hover:underline"
              title={entry.commit_sha}
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(entry.commit_sha!);
              }}
            >
              {entry.commit_sha.slice(0, 7)}
            </span>
          )}
        </div>
        <span className="shrink-0 text-neutral-400 text-[10px]">{formatTimestamp(entry.timestamp)}</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 px-3 py-2 space-y-2 bg-neutral-50/50 dark:bg-neutral-900/30">
          {entry.old_value && (
            <WriteValueBlock label="Old value" value={entry.old_value} />
          )}
          {entry.new_value && (
            <WriteValueBlock label="New value" value={entry.new_value} />
          )}
          <div className="flex gap-3 text-[10px] text-neutral-400">
            <span>domain: <span className="text-neutral-600 dark:text-neutral-300">{entry.domain}</span></span>
            <span>event: <span className="text-neutral-600 dark:text-neutral-300">{entry.event_type}</span></span>
            {entry.field && <span>field: <span className="text-neutral-600 dark:text-neutral-300">{entry.field}</span></span>}
          </div>
        </div>
      )}
    </div>
  );
}

function WriteValueBlock({ label, value }: { label: string; value: string }) {
  const parsed = tryParseJson(value);

  return (
    <div>
      <div className="text-[10px] text-neutral-400 mb-0.5">{label}</div>
      {parsed !== null ? (
        <FoldableJson data={parsed} defaultExpandDepth={1} compact className="max-h-48 overflow-y-auto" />
      ) : (
        <div className="font-mono text-[11px] text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
          {value}
        </div>
      )}
    </div>
  );
}

// -- Grouping helpers --

interface GroupedWrite {
  key: string;
  entity_id: string;
  entity_label: string;
  domain: string;
  actor: string;
  timestamp: string;
  commit_sha: string | null;
  entries: AgentWriteEntry[];
}

/** Group entries that share the same entity_id and timestamp (rounded to 1 s). */
function groupWriteEntries(entries: AgentWriteEntry[]): GroupedWrite[] {
  const map = new Map<string, GroupedWrite>();
  for (const entry of entries) {
    const tsKey = entry.timestamp.slice(0, 19); // ISO truncated to seconds
    const key = `${entry.entity_id}::${tsKey}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        entity_id: entry.entity_id,
        entity_label: entry.entity_label,
        domain: entry.domain,
        actor: entry.actor,
        timestamp: entry.timestamp,
        commit_sha: entry.commit_sha,
        entries: [],
      };
      map.set(key, group);
    }
    group.entries.push(entry);
  }
  return Array.from(map.values());
}

function GroupedWriteRow({
  group,
  agentName,
}: {
  group: GroupedWrite;
  agentName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const domainColor = group.domain === 'plan' ? 'blue' : group.domain === 'prompt' ? 'green' : 'gray';
  const fieldNames = group.entries.map((e) => e.field).filter(Boolean) as string[];
  const eventTypes = [...new Set(group.entries.map((e) => e.event_type))];
  const hasMultiple = group.entries.length > 1;

  // Primary action label — prefer the most specific if uniform, else "updated"
  const primaryAction = eventTypes.length === 1
    ? (ACTION_LABELS[eventTypes[0]] || eventTypes[0])
    : 'updated';
  const badgeColor = eventTypes.length === 1
    ? (ACTION_BADGE_COLORS[eventTypes[0]] || 'gray')
    : 'gray';

  // Single entry with short inline values — show transition directly
  const singleEntry = !hasMultiple ? group.entries[0] : null;
  const singleInline = singleEntry?.field && !hasMultiple
    && (isInlineValue(singleEntry.old_value) || isInlineValue(singleEntry.new_value))
    && !(singleEntry.new_value && !isInlineValue(singleEntry.new_value))
    && !(singleEntry.old_value && !isInlineValue(singleEntry.old_value));

  // Expandable if has multiple entries or has long/JSON values
  const hasExpandableContent = hasMultiple || group.entries.some(
    (e) => (e.new_value && !isInlineValue(e.new_value)) || (e.old_value && !isInlineValue(e.old_value)),
  );

  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-800 text-xs">
      <div
        className={`flex items-start gap-2 px-2 py-1.5 ${hasExpandableContent ? 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40' : ''}`}
        onClick={hasExpandableContent ? () => setExpanded((p) => !p) : undefined}
      >
        <span className="shrink-0 text-neutral-400 text-[10px] mt-0.5 w-3 text-center select-none">
          {hasExpandableContent ? (expanded ? '\u25be' : '\u25b8') : ''}
        </span>
        <Badge color={domainColor} className="text-[10px] shrink-0">{agentName}</Badge>
        <div className="flex-1 min-w-0">
          {group.domain === 'plan' ? (
            <span className="mr-1"><PlanLink planId={group.entity_id} /></span>
          ) : (
            <span className="mr-1 text-neutral-600 dark:text-neutral-300">{group.entity_label}</span>
          )}
          <Badge color={badgeColor} className="text-[9px] ml-0.5">{primaryAction}</Badge>
          {hasMultiple && fieldNames.length > 0 && (
            <span className="ml-1 text-neutral-500">
              {fieldNames.length <= 2 ? fieldNames.join(', ') : `${fieldNames.length} fields`}
            </span>
          )}
          {hasMultiple && (
            <span className="ml-1 text-neutral-400 text-[10px]">({group.entries.length})</span>
          )}
          {!hasMultiple && singleEntry?.field && (
            <span className="ml-1 text-neutral-500">{singleEntry.field}</span>
          )}
          {singleInline && singleEntry && (
            <span className="ml-1 text-neutral-400">
              {singleEntry.old_value && <>{singleEntry.old_value}</>}
              {singleEntry.old_value && singleEntry.new_value && ' \u2192 '}
              {!singleEntry.old_value && singleEntry.new_value && '\u2192 '}
              {singleEntry.new_value && <span className="text-neutral-600 dark:text-neutral-300">{singleEntry.new_value}</span>}
            </span>
          )}
          {!singleInline && !hasMultiple && !expanded && hasExpandableContent && singleEntry?.new_value && (
            <span className="ml-1 text-neutral-400">{'\u2192 '}{summarizeValue(singleEntry.new_value)}</span>
          )}
          {group.commit_sha && (
            <span
              className="ml-1 font-mono text-blue-500 dark:text-blue-400 text-[10px] cursor-pointer hover:underline"
              title={group.commit_sha}
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(group.commit_sha!);
              }}
            >
              {group.commit_sha.slice(0, 7)}
            </span>
          )}
        </div>
        <span className="shrink-0 text-neutral-400 text-[10px]">{formatTimestamp(group.timestamp)}</span>
      </div>

      {expanded && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 px-3 py-2 space-y-2 bg-neutral-50/50 dark:bg-neutral-900/30">
          {group.entries.map((entry) => {
            const entryLabel = ACTION_LABELS[entry.event_type] || entry.event_type;
            const entryBadgeColor = ACTION_BADGE_COLORS[entry.event_type] || 'gray';
            return (
              <div key={entry.id} className="space-y-1">
                <div className="flex items-center gap-2 text-[10px]">
                  <Badge color={entryBadgeColor} className="text-[9px]">{entryLabel}</Badge>
                  {entry.field && <span className="text-neutral-500">{entry.field}</span>}
                  {entry.field && isInlineValue(entry.old_value) && isInlineValue(entry.new_value) && (
                    <span className="text-neutral-400">
                      {entry.old_value} {'\u2192'} <span className="text-neutral-600 dark:text-neutral-300">{entry.new_value}</span>
                    </span>
                  )}
                </div>
                {entry.old_value && !isInlineValue(entry.old_value) && <WriteValueBlock label="Old" value={entry.old_value} />}
                {entry.new_value && !isInlineValue(entry.new_value) && <WriteValueBlock label="New" value={entry.new_value} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Summaries View — work_summary entries from agent_activity_log
// =============================================================================

interface SummaryEntry {
  session_id: string;
  run_id: string | null;
  agent_type: string;
  plan_id: string | null;
  detail: string | null;
  metadata: Record<string, string> | null;
  timestamp: string;
}

function SummariesView() {
  const [entries, setEntries] = useState<SummaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    pixsimClient
      .get<{ entries: SummaryEntry[]; total: number }>('/meta/agents/history', {
        params: { action: 'work_summary', limit: 50 },
      })
      .then((r) => setEntries(r.entries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Loading summaries..." icon={<Icon name="loader" size={20} />} />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="No work summaries yet" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <div className="text-[10px] text-neutral-400 mb-2">{entries.length} summaries</div>
      {entries.map((e, i) => {
        const expanded = expandedIdx === i;
        const commitSha = e.metadata?.commit;
        return (
          <div key={`${e.timestamp}-${i}`} className="rounded border border-neutral-200 dark:border-neutral-800">
            <button
              onClick={() => setExpandedIdx(expanded ? null : i)}
              className="w-full flex items-start gap-2 px-2 py-1.5 text-xs text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
            >
              <Icon
                name="fileText"
                size={12}
                className={`shrink-0 mt-0.5 ${e.agent_type === 'claude' ? 'text-blue-400' : 'text-violet-400'}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  {e.plan_id && (
                    <Badge color="green" className="text-[9px]">plan:{e.plan_id}</Badge>
                  )}
                  {commitSha && (
                    <Badge color="gray" className="text-[9px] font-mono">{commitSha}</Badge>
                  )}
                </div>
                {e.detail && (
                  expanded
                    ? <FormattedSummary text={e.detail} className="text-neutral-500 mt-1 text-xs" />
                    : <div className="text-neutral-500 mt-0.5 truncate">{e.detail}</div>
                )}
              </div>
              <span className="shrink-0 text-neutral-400 text-[10px]">{formatTimestamp(e.timestamp)}</span>
              <Icon name="chevronRight" size={10} className={`shrink-0 text-neutral-400 transition-transform mt-0.5 ${expanded ? 'rotate-90' : ''}`} />
            </button>

            {expanded && (
              <div className="border-t border-neutral-100 dark:border-neutral-800 px-2 py-1.5 space-y-1">
                <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                  <span>Session: {e.session_id.slice(0, 12)}</span>
                  {e.run_id && <span>Run: {e.run_id.slice(0, 8)}</span>}
                </div>
                {e.plan_id && (
                  <button
                    onClick={() => navigateToPlan(e.plan_id!)}
                    className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                  >
                    <Icon name="externalLink" size={10} />
                    Open plan
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Writes / Audit View
// =============================================================================

function WritesView() {
  const [data, setData] = useState<AgentWritesResponse | null>(null);
  const [profileLabels, setProfileLabels] = useState<ReadonlyMap<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(true);

  useEffect(() => {
    Promise.all([
      pixsimClient.get<AgentWritesResponse>('/meta/agents/writes', { params: { days: 14, limit: 100 } }),
      pixsimClient.get<AgentProfileListResponse>('/dev/agent-profiles').catch(() => ({ profiles: [] })),
    ])
      .then(([writes, profiles]) => {
        setData(writes);
        const labels = new Map<string, string>();
        for (const p of profiles.profiles) labels.set(p.id, p.label);
        setProfileLabels(labels);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return domainFilter ? data.entries.filter((e) => e.domain === domainFilter) : data.entries;
  }, [data, domainFilter]);

  const domainOptions = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const e of data.entries) counts.set(e.domain, (counts.get(e.domain) || 0) + 1);
    return Array.from(counts.entries()).map(([d, c]) => ({ value: d, label: d, count: c }));
  }, [data]);

  const groups = useMemo(() => grouped ? groupWriteEntries(filtered) : null, [filtered, grouped]);

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
        <EmptyState message="No agent mutations tracked yet" />
      </div>
    );
  }

  const displayCount = grouped && groups ? groups.length : filtered.length;

  return (
    <div className="p-4 space-y-2">
      <SectionHeader>{data.total} agent mutation{data.total !== 1 ? 's' : ''} (last 14 days)</SectionHeader>
      <div className="flex items-center gap-2 flex-wrap">
        <FilterPillGroup
          options={domainOptions}
          value={domainFilter}
          onChange={setDomainFilter}
          allLabel="All"
          allCount={data.total}
          size="sm"
        />
        <ToolbarToggleButton
          active={grouped}
          onClick={() => setGrouped((g) => !g)}
          icon={<Icon name="layers" size={12} />}
          title={grouped ? 'Ungroup entries' : 'Group by entity + timestamp'}
        />
      </div>
      {domainFilter && displayCount !== data.total && (
        <div className="text-[10px] text-neutral-400">
          Showing {displayCount} {grouped ? 'group' : 'entr'}{displayCount !== 1 ? (grouped ? 's' : 'ies') : (grouped ? '' : 'y')}
        </div>
      )}
      <div className="space-y-1">
        {grouped && groups
          ? groups.map((group) => {
              const agentName = formatActorLabel(
                { fallback: group.actor },
                { profileLabels },
              );
              return <GroupedWriteRow key={group.key} group={group} agentName={agentName} />;
            })
          : filtered.map((entry) => {
              const agentName = formatActorLabel(
                { fallback: entry.actor },
                { profileLabels },
              );
              return <WriteEntryRow key={entry.id} entry={entry} agentName={agentName} />;
            })}
      </div>
    </div>
  );
}

// =============================================================================
// Profiles View — persistent agent identities
// =============================================================================

interface AgentProfileEntry {
  id: string;
  user_id: number;
  label: string;
  description: string | null;
  icon: string | null;
  agent_type: string;
  system_prompt: string | null;
  model_id: string | null;
  config: Record<string, unknown> | null;
  audience: string;
  default_scopes: string[] | null;
  assigned_plans: string[] | null;
  status: string;
  is_default: boolean;
  is_global: boolean;
  created_at: string;
  updated_at: string;
}

interface AgentProfileListResponse {
  profiles: AgentProfileEntry[];
  total: number;
}

interface MintedToken {
  access_token: string;
  command: string;
  agent_id: string;
  expires_in_hours: number;
}

const PROFILE_STATUS_COLORS: Record<string, 'green' | 'gray' | 'orange'> = {
  active: 'green',
  paused: 'orange',
  archived: 'gray',
};

// =============================================================================
// Agents View — unified profile + sessions + live bridge state
// =============================================================================

interface BridgeSummary {
  bridge_client_id: string;
  connected_at: string;
  busy: boolean;
  tasks_completed: number;
  engines: string[];
  pool_sessions: PoolSession[];
}

interface ObservabilityEntry {
  profile: AgentProfileEntry;
  recent_sessions: {
    id: string;
    engine: string;
    label: string;
    message_count: number;
    summary_count?: number;
    last_used_at: string;
    created_at: string;
  }[];
}

interface ObservabilityResponse {
  agents: ObservabilityEntry[];
  total_profiles: number;
  bridges: BridgeSummary[];
  active_session_profile_ids?: string[];
  active_session_ids?: string[];
}

interface AgentEditFormState {
  label: string;
  description: string;
  icon: string;
  agent_type: string;
  system_prompt: string;
  audience: string;
}

const RECENT_SESSION_MS = 60 * 60 * 1000; // 1 hour

function AgentsView({ focusAgentId }: { focusAgentId?: string } = {}) {
  const [data, setData] = useState<ObservabilityResponse | null>(null);
  const [bridgeAction, setBridgeAction] = useState('');
  const [skipPermissions, setSkipPermissions] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(focusAgentId ?? null);
  const [mintedToken, setMintedToken] = useState<MintedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [archivingSessionId, setArchivingSessionId] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);
  const [summariesSessionId, setSummariesSessionId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<{ detail: string; timestamp: string; plan_id?: string; agent_type?: string; contract_id?: string; session_id?: string; metadata?: Record<string, string> }[]>([]);
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [newProfileId, setNewProfileId] = useState('');
  const [newProfileLabel, setNewProfileLabel] = useState('');
  const [newProfileDescription, setNewProfileDescription] = useState('');
  const [newProfileIcon, setNewProfileIcon] = useState('');
  const [newProfileAgentType, setNewProfileAgentType] = useState('claude');
  const [newProfileMethod, setNewProfileMethod] = useState('remote');
  const [newProfileModelId, setNewProfileModelId] = useState('');
  const [newProfileReasoningEffort, setNewProfileReasoningEffort] = useState('');
  const [newProfileSystemPrompt, setNewProfileSystemPrompt] = useState('');
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [createProfileError, setCreateProfileError] = useState<string | null>(null);
  const [editProfile, setEditProfile] = useState<AgentProfileEntry | null>(null);
  const [editForm, setEditForm] = useState<AgentEditFormState>({
    label: '',
    description: '',
    icon: '',
    agent_type: '',
    system_prompt: '',
    audience: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<AgentProfileEntry | null>(null);
  const [profileActionError, setProfileActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await pixsimClient.get<ObservabilityResponse>('/dev/agent-profiles/observability');
      setData(res);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); const i = setInterval(load, 8000); return () => clearInterval(i); }, [load]);

  // Auto-expand profile when navigated from notification or cross-panel link
  useEffect(() => {
    if (focusAgentId) setExpandedId(focusAgentId);
  }, [focusAgentId]);

  const startServerBridge = useCallback(async () => {
    setBridgeAction('starting');
    try {
      const extraArgs = skipPermissions ? '--dangerously-skip-permissions' : undefined;
      const res = await pixsimClient.post<{ ok: boolean; message: string }>('/meta/agents/bridge/start', {
        pool_size: 1, extra_args: extraArgs,
      });
      setBridgeAction(res.message || 'Started');
      setTimeout(load, 2000);
    } catch { setBridgeAction('Failed to start'); }
  }, [load, skipPermissions]);

  const stopServerBridge = useCallback(async () => {
    setBridgeAction('stopping');
    try {
      const res = await pixsimClient.post<{ ok: boolean; message: string }>('/meta/agents/bridge/stop');
      setBridgeAction(res.message || 'Stopped');
      setTimeout(load, 1000);
    } catch { setBridgeAction('Failed to stop'); }
  }, [load]);

  const handleMintToken = async (profileId: string) => {
    try {
      const resp = await pixsimClient.post<MintedToken>(
        `/dev/agent-profiles/${profileId}/token`, undefined, { params: { hours: 24, scope: 'dev' } },
      );
      setMintedToken(resp);
      setCopied(false);
    } catch { /* handled by client */ }
  };

  const handleArchiveChatSession = useCallback(async (sessionId: string, label: string) => {
    if (archivingSessionId) return;
    const display = label.trim() || 'session';
    if (!confirm(`Archive session "${display}"?`)) return;
    setSessionActionError(null);
    setArchivingSessionId(sessionId);
    try {
      await pixsimClient.delete(`/meta/agents/chat-sessions/${sessionId}`);
      await load();
    } catch {
      setSessionActionError(`Failed to archive "${display}".`);
    } finally {
      setArchivingSessionId(null);
    }
  }, [archivingSessionId, load]);

  const handleViewSummaries = useCallback(async (sessionId: string) => {
    if (summariesSessionId === sessionId) {
      setSummariesSessionId(null);
      return;
    }
    try {
      const res = await pixsimClient.get<{ entries: { detail: string; timestamp: string; plan_id?: string; agent_type?: string; contract_id?: string; session_id?: string; metadata?: Record<string, string> }[] }>(
        '/meta/agents/history', { params: { session_id: sessionId, action: 'work_summary', limit: 20 } },
      );
      setSummaries(res.entries ?? []);
      setSummariesSessionId(sessionId);
    } catch {
      setSummaries([]);
      setSummariesSessionId(sessionId);
    }
  }, [summariesSessionId]);

  const resetCreateProfileForm = useCallback(() => {
    setNewProfileId('');
    setNewProfileLabel('');
    setNewProfileDescription('');
    setNewProfileIcon('');
    setNewProfileAgentType('claude');
    setNewProfileMethod('remote');
    setNewProfileModelId('');
    setNewProfileReasoningEffort('');
    setNewProfileSystemPrompt('');
    setCreateProfileError(null);
  }, []);

  const handleCreateProfile = useCallback(async () => {
    if (creatingProfile || !newProfileLabel.trim()) return;
    setCreatingProfile(true);
    setCreateProfileError(null);
    try {
      const slug = newProfileId.trim() || `profile-${Date.now().toString(36)}`;
      const config = newProfileReasoningEffort ? { reasoning_effort: newProfileReasoningEffort } : null;
      await pixsimClient.post('/dev/agent-profiles', {
        id: slug,
        label: newProfileLabel.trim(),
        description: newProfileDescription.trim() || null,
        icon: newProfileIcon.trim() || null,
        system_prompt: newProfileSystemPrompt.trim() || null,
        agent_type: newProfileAgentType,
        method: newProfileMethod || null,
        model_id: newProfileModelId.trim() || null,
        config,
        audience: 'user',
      });
      setShowCreateProfile(false);
      resetCreateProfileForm();
      await load();
      setExpandedId(slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create profile';
      setCreateProfileError(message);
    } finally {
      setCreatingProfile(false);
    }
  }, [
    creatingProfile,
    newProfileLabel,
    newProfileId,
    newProfileReasoningEffort,
    newProfileDescription,
    newProfileIcon,
    newProfileSystemPrompt,
    newProfileAgentType,
    newProfileMethod,
    newProfileModelId,
    resetCreateProfileForm,
    load,
  ]);

  const openEditProfile = useCallback((profile: AgentProfileEntry) => {
    setProfileActionError(null);
    setEditProfile(profile);
    setEditForm({
      label: profile.label,
      description: profile.description || '',
      icon: profile.icon || '',
      agent_type: profile.agent_type,
      system_prompt: profile.system_prompt || '',
      audience: profile.audience,
    });
  }, []);

  const handleSaveEditProfile = useCallback(async () => {
    if (!editProfile) return;
    const updates: Record<string, unknown> = {};
    if (editForm.label !== editProfile.label) updates.label = editForm.label;
    if (editForm.description !== (editProfile.description || '')) updates.description = editForm.description || null;
    if (editForm.icon !== (editProfile.icon || '')) updates.icon = editForm.icon || null;
    if (editForm.agent_type !== editProfile.agent_type) updates.agent_type = editForm.agent_type;
    if (editForm.system_prompt !== (editProfile.system_prompt || '')) updates.system_prompt = editForm.system_prompt || null;
    if (editForm.audience !== editProfile.audience) updates.audience = editForm.audience;
    if (Object.keys(updates).length === 0) {
      setEditProfile(null);
      return;
    }
    setProfileActionError(null);
    try {
      await pixsimClient.patch(`/dev/agent-profiles/${editProfile.id}`, updates);
      setEditProfile(null);
      await load();
    } catch {
      setProfileActionError(`Failed to update "${editProfile.label}".`);
    }
  }, [editProfile, editForm, load]);

  const handleDeleteProfile = useCallback(async () => {
    if (!deleteTarget) return;
    setProfileActionError(null);
    try {
      await pixsimClient.delete(`/dev/agent-profiles/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch {
      setProfileActionError(`Failed to archive "${deleteTarget.label}".`);
    }
  }, [deleteTarget, load]);

  const allBridges = data?.bridges ?? [];
  const hasBridge = allBridges.length > 0;

  return (
    <div className="p-4 space-y-4">
      {/* Bridge controls */}
      <SectionHeader>Bridge</SectionHeader>
      {!hasBridge ? (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-900 space-y-2.5">
            <div className="text-[11px] text-neutral-500">
              Auto-detects engines (claude, codex). Sessions spawn on demand.
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={skipPermissions} onChange={(e) => setSkipPermissions(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-neutral-300 accent-accent" />
              <span className="text-[11px] text-neutral-500">Skip permissions</span>
            </label>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-end">
            <Button size="sm" onClick={startServerBridge} disabled={bridgeAction === 'starting'}>
              {bridgeAction === 'starting' ? 'Starting...' : 'Start Bridge'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge color="green" className="text-[10px]">connected</Badge>
            <span className="text-[10px] text-neutral-400">
              {allBridges.length} bridge{allBridges.length !== 1 ? 's' : ''}
            </span>
            <div className="ml-auto">
              <Button size="sm" variant="ghost" onClick={stopServerBridge} disabled={bridgeAction === 'stopping'}>
                {bridgeAction === 'stopping' ? 'Stopping...' : 'Stop'}
              </Button>
            </div>
          </div>
          {allBridges.map((ba) => (
            <div key={ba.bridge_client_id} className="px-3 py-1.5 rounded border border-neutral-200 dark:border-neutral-800 text-[10px] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              <span className="font-mono text-neutral-500">{ba.bridge_client_id}</span>
              {ba.engines.map((e) => (
                <Badge key={e} color={e === 'claude' ? 'blue' : e === 'codex' ? 'purple' : 'gray'} className="text-[9px]">{e}</Badge>
              ))}
              <span className="text-neutral-400 ml-auto">{ba.tasks_completed} tasks</span>
            </div>
          ))}
        </div>
      )}

      {bridgeAction && bridgeAction !== 'starting' && bridgeAction !== 'stopping' && (
        <div className="text-xs text-neutral-500">{bridgeAction}</div>
      )}
      {sessionActionError && (
        <div className="text-xs text-red-600 dark:text-red-400">{sessionActionError}</div>
      )}
      {profileActionError && (
        <div className="text-xs text-red-600 dark:text-red-400">{profileActionError}</div>
      )}

      {/* Minted token display */}
      {mintedToken && (
        <div className="p-3 rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Token for {mintedToken.agent_id}</span>
            <button onClick={() => setMintedToken(null)} className="text-neutral-400 hover:text-neutral-600 text-xs">dismiss</button>
          </div>
          <div className="text-[10px] font-mono bg-white dark:bg-neutral-900 p-2 rounded break-all select-all max-h-16 overflow-y-auto">
            {mintedToken.command}
          </div>
          <Button size="sm" onClick={() => { if (mintedToken) { navigator.clipboard.writeText(mintedToken.command); setCopied(true); } }}>
            {copied ? 'Copied' : 'Copy command'}
          </Button>
        </div>
      )}

      {/* Agent profiles */}
      <SectionHeader
        trailing={(
          <Button
            size="sm"
            onClick={() => {
              resetCreateProfileForm();
              setShowCreateProfile(true);
            }}
          >
            <Icon name="plus" size={10} />
            New profile
          </Button>
        )}
      >
        {data?.total_profiles ?? 0} Agents
      </SectionHeader>

      <div className="space-y-2">
        {(data?.agents ?? []).map((entry) => {
          const { profile: p, recent_sessions: sessions } = entry;
          const expanded = expandedId === p.id;
          const hasActiveSession = sessions.some((s) => data?.active_session_ids?.includes(s.id));
          const isLive = hasActiveSession;

          return (
            <div key={p.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpandedId(expanded ? null : p.id)}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 flex items-center gap-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  isLive ? 'bg-green-500 animate-pulse-subtle'
                    : p.status === 'paused' ? 'bg-yellow-500'
                    : 'bg-neutral-400'
                }`} />
                {p.icon && <Icon name={p.icon as import('@lib/icons').IconName} size={12} className="shrink-0 text-neutral-500" />}
                <span className="text-xs font-medium truncate">{p.label}</span>
                <Badge color="gray" className="text-[9px]">{p.agent_type}</Badge>
                {p.model_id && <span className="text-[9px] text-neutral-400 truncate max-w-[80px]">{p.model_id.split(':').pop()}</span>}
                <span className="ml-auto text-[9px] text-neutral-400 shrink-0">
                  {sessions.length > 0 ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''}` : ''}
                </span>
                <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={10} className="text-neutral-400 shrink-0" />
              </button>

              {/* Expanded content */}
              {expanded && (
                <div className="border-t border-neutral-100 dark:border-neutral-800">
                  {/* Actions bar */}
                  <div className="px-3 py-1.5 flex items-center gap-1 bg-neutral-25 dark:bg-neutral-900/50">
                    <span className="text-[10px] font-mono text-neutral-400 flex-1">{p.id}</span>
                    <Button size="sm" variant="ghost" onClick={() => handleMintToken(p.id)} title="Mint CLI token">
                      <Icon name="key" size={10} />
                    </Button>
                    {!p.is_global && (
                      <Button size="sm" variant="ghost" onClick={() => openEditProfile(p)} title="Edit profile">
                        <Icon name="edit" size={10} />
                      </Button>
                    )}
                    {!p.is_global && p.status !== 'archived' && (
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(p)} title="Archive profile">
                        <Icon name="trash" size={10} />
                      </Button>
                    )}
                  </div>

                  {/* Sessions */}
                  {sessions.length > 0 && (
                    <div className="px-3 py-1.5">
                      <div className="text-[9px] text-neutral-400 uppercase tracking-wider mb-1">Sessions</div>
                      <div className="space-y-1">
                        {sessions.map((s) => {
                          const elapsed = Date.now() - new Date(s.last_used_at).getTime();
                          const isRecent = elapsed < RECENT_SESSION_MS;
                          const isActiveHeartbeat = data?.active_session_ids?.includes(s.id) ?? false;
                          const sessionLive = isRecent || isActiveHeartbeat;
                          return (
                            <div key={s.id} className="group/session flex items-center gap-2 text-[11px] py-1">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${sessionLive ? 'bg-green-500' : 'bg-neutral-300 dark:bg-neutral-600'}`} />
                              <Badge color={s.engine === 'claude' ? 'blue' : s.engine === 'codex' ? 'purple' : 'gray'} className="text-[9px]">{s.engine}</Badge>
                              <span className="text-neutral-500 truncate flex-1">{s.label}</span>
                              {s.message_count > 0 && (
                                <span className="flex items-center gap-1 text-neutral-400" title={`${s.message_count} messages`}>
                                  <Icon name="messageSquare" size={11} />
                                  <span>{s.message_count}</span>
                                </span>
                              )}
                              {(s.summary_count ?? 0) > 0 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); void handleViewSummaries(s.id); }}
                                  className="flex items-center gap-1 text-neutral-400 hover:text-accent transition-colors"
                                  title="View work summaries"
                                >
                                  <Icon name="fileText" size={11} />
                                  <span>{s.summary_count}</span>
                                </button>
                              )}
                              <span className="text-neutral-400">{formatTimestamp(s.last_used_at)}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.dispatchEvent(new CustomEvent('ai-assistant:resume-session', {
                                    detail: { sessionId: s.id, engine: s.engine, label: s.label, profileId: p.id },
                                  }));
                                  openWorkspacePanel('ai-assistant');
                                }}
                                className="text-neutral-400 hover:text-accent shrink-0"
                                title="Resume in AI Assistant"
                              >
                                <Icon name="play" size={12} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleArchiveChatSession(s.id, s.label);
                                }}
                                disabled={archivingSessionId === s.id}
                                className="text-neutral-400 hover:text-red-500 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Archive session"
                              >
                                <Icon name="trash2" size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {sessions.length === 0 && (
                    <div className="px-3 py-2 text-[10px] text-neutral-400">No sessions yet</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Orphan bridges are now shown inline in the Bridge section above */}

      {!data && (
        <div className="flex items-center justify-center py-8">
          <EmptyState message="Loading..." icon={<Icon name="loader" size={20} />} />
        </div>
      )}

      <Modal
        isOpen={showCreateProfile}
        onClose={() => {
          if (creatingProfile) return;
          setShowCreateProfile(false);
        }}
        title="New Profile"
        size="sm"
      >
        <div className="space-y-2">
          <input
            value={newProfileId}
            onChange={(e) => setNewProfileId(e.target.value)}
            placeholder="ID (slug, optional)"
            className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            value={newProfileLabel}
            onChange={(e) => setNewProfileLabel(e.target.value)}
            placeholder="Name *"
            className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            value={newProfileDescription}
            onChange={(e) => setNewProfileDescription(e.target.value)}
            placeholder="Description"
            className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            value={newProfileIcon}
            onChange={(e) => setNewProfileIcon(e.target.value)}
            placeholder="Icon (e.g. sparkles, code, cpu)"
            className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex gap-1.5">
            <select
              value={newProfileAgentType}
              onChange={(e) => setNewProfileAgentType(e.target.value)}
              className="flex-1 px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="custom">Custom</option>
            </select>
            <select
              value={newProfileMethod}
              onChange={(e) => setNewProfileMethod(e.target.value)}
              className="flex-1 px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="remote">CMD (bridge)</option>
              <option value="api">API (direct)</option>
            </select>
          </div>
          <input
            value={newProfileModelId}
            onChange={(e) => setNewProfileModelId(e.target.value)}
            placeholder="Model override (optional)"
            className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <select
            value={newProfileReasoningEffort}
            onChange={(e) => setNewProfileReasoningEffort(e.target.value)}
            className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Effort (default)</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            {newProfileAgentType === 'claude' && <option value="max">Max</option>}
            {newProfileAgentType === 'codex' && <option value="xhigh">Extra High</option>}
          </select>
          <textarea
            value={newProfileSystemPrompt}
            onChange={(e) => setNewProfileSystemPrompt(e.target.value)}
            placeholder="Persona / system prompt"
            rows={3}
            className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {createProfileError && (
            <div className="text-[10px] text-red-500">{createProfileError}</div>
          )}
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={() => {
                if (creatingProfile) return;
                setShowCreateProfile(false);
              }}
              className="px-2 py-1 text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 disabled:opacity-50"
              disabled={creatingProfile}
            >
              Cancel
            </button>
            <Button size="sm" onClick={() => void handleCreateProfile()} disabled={creatingProfile || !newProfileLabel.trim()}>
              {creatingProfile ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!editProfile} onClose={() => setEditProfile(null)} title={`Edit: ${editProfile?.label || ''}`} size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Label</label>
            <input
              value={editForm.label}
              onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
              className="w-full px-2 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Description</label>
            <input
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="Optional description"
              className="w-full px-2 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Icon</label>
            <input
              value={editForm.icon}
              onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
              placeholder="Icon name (e.g. cpu, sparkles, code)"
              className="w-full px-2 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Type</label>
              <select
                value={editForm.agent_type}
                onChange={(e) => setEditForm({ ...editForm, agent_type: e.target.value })}
                className="w-full px-2 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
              >
                <option value="claude">claude</option>
                <option value="assistant">assistant</option>
                <option value="codex">codex</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Audience</label>
              <select
                value={editForm.audience}
                onChange={(e) => setEditForm({ ...editForm, audience: e.target.value })}
                className="w-full px-2 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
              >
                <option value="user">user</option>
                <option value="dev">dev</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">System Prompt</label>
            <textarea
              rows={4}
              value={editForm.system_prompt}
              onChange={(e) => setEditForm({ ...editForm, system_prompt: e.target.value })}
              placeholder="Optional system prompt / instructions"
              className="w-full px-2 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 resize-y"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" onClick={() => setEditProfile(null)}>Cancel</Button>
            <Button size="sm" onClick={() => void handleSaveEditProfile()} disabled={!editForm.label.trim()}>Save</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onConfirm={() => void handleDeleteProfile()}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Profile"
        message={`Archive "${deleteTarget?.label}"? It will no longer appear in profile lists or be usable for token minting.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Work Summaries Modal */}
      <Modal isOpen={!!summariesSessionId} onClose={() => setSummariesSessionId(null)} title="Work Summaries" size="md">
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {summaries.length === 0 ? (
            <div className="text-sm text-neutral-400 italic py-4 text-center">No work summaries for this session</div>
          ) : summaries.map((entry, i) => (
            <div key={i} className="border-b border-neutral-100 dark:border-neutral-800 pb-3 last:border-0">
              <FormattedSummary text={entry.detail} className="text-sm text-neutral-700 dark:text-neutral-200 leading-relaxed" />
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-[10px] text-neutral-400">{formatTimestamp(entry.timestamp)}</span>
                {entry.agent_type && (
                  <Badge color={entry.agent_type === 'claude' ? 'blue' : entry.agent_type === 'codex' ? 'purple' : 'gray'} className="text-[9px]">
                    {entry.agent_type}
                  </Badge>
                )}
                {entry.plan_id && (
                  <button
                    onClick={() => {
                      setSummariesSessionId(null);
                      openWorkspacePanel('plans');
                      setTimeout(() => window.dispatchEvent(new CustomEvent('plans:navigate', { detail: { planId: entry.plan_id } })), 200);
                    }}
                    className="text-[10px] text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                  >
                    plan:{entry.plan_id}
                  </button>
                )}
                {entry.contract_id && (
                  <Badge color="gray" className="text-[9px]">{entry.contract_id}</Badge>
                )}
                {entry.metadata?.commit && (
                  <span className="text-[9px] font-mono text-neutral-400" title={`Commit: ${entry.metadata.commit}`}>
                    <Icon name="gitBranch" size={9} className="inline mr-0.5" />
                    {entry.metadata.commit}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}


// =============================================================================
// Profiles View (legacy — kept for direct profile management)
// =============================================================================

interface EditFormState {
  label: string;
  description: string;
  icon: string;
  agent_type: string;
  system_prompt: string;
  audience: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for backward compat, may be re-enabled
function ProfilesView() {
  const [profiles, setProfiles] = useState<AgentProfileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [mintedToken, setMintedToken] = useState<MintedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [editProfile, setEditProfile] = useState<AgentProfileEntry | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ label: '', description: '', icon: '', agent_type: '', system_prompt: '', audience: '' });
  const [deleteTarget, setDeleteTarget] = useState<AgentProfileEntry | null>(null);

  // Create form
  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('claude');

  const loadProfiles = useCallback(() => {
    pixsimClient
      .get<AgentProfileListResponse>('/dev/agent-profiles')
      .then((r) => setProfiles(r.profiles))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const handleCreate = async () => {
    if (!newId.trim() || !newLabel.trim()) return;
    try {
      await pixsimClient.post('/dev/agent-profiles', {
        id: newId.trim().toLowerCase().replace(/\s+/g, '-'),
        label: newLabel.trim(),
        agent_type: newType,
      });
      setNewId('');
      setNewLabel('');
      setCreating(false);
      loadProfiles();
    } catch { /* handled by client */ }
  };

  const handleMintToken = async (profileId: string) => {
    try {
      const resp = await pixsimClient.post<MintedToken>(
        `/dev/agent-profiles/${profileId}/token`,
        undefined,
        { params: { hours: 24, scope: 'dev' } },
      );
      setMintedToken(resp);
      setCopied(false);
    } catch { /* handled by client */ }
  };

  const openEdit = (profile: AgentProfileEntry) => {
    setEditProfile(profile);
    setEditForm({
      label: profile.label,
      description: profile.description || '',
      icon: profile.icon || '',
      agent_type: profile.agent_type,
      system_prompt: profile.system_prompt || '',
      audience: profile.audience,
    });
  };

  const handleSaveEdit = async () => {
    if (!editProfile) return;
    const updates: Record<string, unknown> = {};
    if (editForm.label !== editProfile.label) updates.label = editForm.label;
    if (editForm.description !== (editProfile.description || '')) updates.description = editForm.description || null;
    if (editForm.icon !== (editProfile.icon || '')) updates.icon = editForm.icon || null;
    if (editForm.agent_type !== editProfile.agent_type) updates.agent_type = editForm.agent_type;
    if (editForm.system_prompt !== (editProfile.system_prompt || '')) updates.system_prompt = editForm.system_prompt || null;
    if (editForm.audience !== editProfile.audience) updates.audience = editForm.audience;

    if (Object.keys(updates).length === 0) { setEditProfile(null); return; }

    try {
      await pixsimClient.patch(`/dev/agent-profiles/${editProfile.id}`, updates);
      setEditProfile(null);
      loadProfiles();
    } catch { /* handled by client */ }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await pixsimClient.delete(`/dev/agent-profiles/${deleteTarget.id}`);
      setDeleteTarget(null);
      loadProfiles();
    } catch { /* handled by client */ }
  };

  const copyCommand = () => {
    if (mintedToken) {
      navigator.clipboard.writeText(mintedToken.command);
      setCopied(true);
    }
  };

  const inputCls = "w-full px-2 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Loading profiles..." icon={<Icon name="loader" size={20} />} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeader>{profiles.length} profile{profiles.length !== 1 ? 's' : ''}</SectionHeader>
        <Button size="sm" onClick={() => setCreating(!creating)}>
          {creating ? 'Cancel' : '+ New'}
        </Button>
      </div>

      {creating && (
        <div className="space-y-2 p-3 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
          <input className={inputCls} placeholder="ID (slug, e.g. plan-worker)" value={newId} onChange={(e) => setNewId(e.target.value)} />
          <input className={inputCls} placeholder="Label (e.g. Claude Plan Worker)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <select className={inputCls} value={newType} onChange={(e) => setNewType(e.target.value)}>
            <option value="claude">claude</option>
            <option value="codex">codex</option>
            <option value="custom">custom</option>
          </select>
          <Button size="sm" onClick={handleCreate} disabled={!newId.trim() || !newLabel.trim()}>Create</Button>
        </div>
      )}

      {mintedToken && (
        <div className="p-3 rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Token for {mintedToken.agent_id}</span>
            <button onClick={() => setMintedToken(null)} className="text-neutral-400 hover:text-neutral-600 text-xs">dismiss</button>
          </div>
          <div className="text-[10px] font-mono bg-white dark:bg-neutral-900 p-2 rounded break-all select-all max-h-16 overflow-y-auto">
            {mintedToken.command}
          </div>
          <Button size="sm" onClick={copyCommand}>{copied ? 'Copied' : 'Copy command'}</Button>
        </div>
      )}

      <div className="space-y-1">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="flex items-center gap-2 px-2 py-2 rounded border border-neutral-200 dark:border-neutral-800 text-xs"
          >
            <Badge color={PROFILE_STATUS_COLORS[profile.status] ?? 'gray'} className="text-[10px] shrink-0">
              {profile.status}
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {profile.icon && <Icon name={profile.icon as import('@lib/icons').IconName} size={10} className="inline mr-1" />}
                {profile.label}
              </div>
              <div className="text-neutral-500 font-mono text-[10px]">{profile.id}</div>
              {profile.description && (
                <div className="text-neutral-400 text-[10px] truncate mt-0.5">{profile.description}</div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {profile.status === 'active' && (
                <Button size="sm" onClick={() => handleMintToken(profile.id)} title="Mint CLI token">
                  <Icon name="key" size={10} />
                </Button>
              )}
              {!profile.is_global && (
                <Button size="sm" onClick={() => openEdit(profile)} title="Edit profile">
                  <Icon name="edit" size={10} />
                </Button>
              )}
              {!profile.is_global && profile.status !== 'archived' && (
                <Button size="sm" onClick={() => setDeleteTarget(profile)} title="Delete profile">
                  <Icon name="trash" size={10} />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {profiles.length === 0 && !creating && (
        <EmptyState message="No agent profiles yet. Create one to get a stable identity for your AI agents." />
      )}

      {/* Edit Modal */}
      <Modal isOpen={!!editProfile} onClose={() => setEditProfile(null)} title={`Edit: ${editProfile?.label || ''}`} size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Label</label>
            <input className={inputCls} value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Description</label>
            <input className={inputCls} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Optional description" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Icon</label>
            <input className={inputCls} value={editForm.icon} onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })} placeholder="Icon name (e.g. cpu, sparkles, code)" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Type</label>
              <select className={inputCls} value={editForm.agent_type} onChange={(e) => setEditForm({ ...editForm, agent_type: e.target.value })}>
                <option value="claude">claude</option>
                <option value="assistant">assistant</option>
                <option value="codex">codex</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Audience</label>
              <select className={inputCls} value={editForm.audience} onChange={(e) => setEditForm({ ...editForm, audience: e.target.value })}>
                <option value="user">user</option>
                <option value="dev">dev</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">System Prompt</label>
            <textarea
              className={`${inputCls} resize-y`}
              rows={4}
              value={editForm.system_prompt}
              onChange={(e) => setEditForm({ ...editForm, system_prompt: e.target.value })}
              placeholder="Optional system prompt / instructions"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" onClick={() => setEditProfile(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={!editForm.label.trim()}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Profile"
        message={`Archive "${deleteTarget?.label}"? It will no longer appear in profile lists or be usable for token minting.`}
        confirmText="Delete"
        variant="danger"
      />
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
  bridge_client_id?: string;
  duration_ms?: number;
  timestamp: Date;
}

interface BridgeStatus {
  connected: number;
  available: number;
  agents: { bridge_client_id: string; agent_type: string; busy: boolean; tasks_completed: number }[];
}

interface SendMessageApiResponse {
  ok: boolean;
  bridge_client_id: string;
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
            bridge_client_id: res.bridge_client_id,
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
          <Badge key={a.bridge_client_id} color={a.busy ? 'orange' : 'gray'} className="text-[10px]">
            {a.bridge_client_id.slice(0, 12)} ({a.agent_type})
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
                  {msg.bridge_client_id && <span>{msg.bridge_client_id}</span>}
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

export function AgentObservabilityPanel({ context }: { context?: { focusAgentId?: string; [key: string]: any } } = {}) {
  const { theme: variant } = useTheme();

  const sections = useMemo<SidebarContentLayoutSection[]>(() => [
    {
      id: 'graph',
      label: 'Contract Graph',
      icon: <Icon name="graph" size={12} />,
    },
    {
      id: 'agents',
      label: 'Agents',
      icon: <Icon name="users" size={12} />,
    },
    {
      id: 'history',
      label: 'History',
      icon: <Icon name="clock" size={12} />,
    },
    {
      id: 'summaries',
      label: 'Summaries',
      icon: <Icon name="fileText" size={12} />,
    },
    {
      id: 'writes',
      label: 'Audit',
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
    initial: 'agents',
    storageKey: 'agent-observability:nav',
  });

  let content: React.ReactNode;
  switch (nav.activeId) {
    case 'agents':
      content = <AgentsView focusAgentId={context?.focusAgentId} />;
      break;
    case 'profiles':
      // Backward compatibility with persisted nav state from previous builds.
      content = <AgentsView focusAgentId={context?.focusAgentId} />;
      break;
    case 'graph':
      content = <ContractGraphView />;
      break;
    case 'history':
      content = <HistoryView />;
      break;
    case 'summaries':
      content = <SummariesView />;
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
