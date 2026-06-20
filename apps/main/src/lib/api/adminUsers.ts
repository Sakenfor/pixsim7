import { pixsimClient } from './client';

export interface AdminUserPermissions {
  id: number;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  permissions: string[];
  created_at: string;
  last_login_at: string | null;
  bridge_machines?: BridgeMachine[];
  bridge_machines_total?: number;
  bridge_machines_online?: number;
}

export interface AdminUsersListResponse {
  users: AdminUserPermissions[];
  total: number;
}

export interface ListAdminUsersParams {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface BridgeMachine {
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

export interface BridgeMachinesResponse {
  total: number;
  machines: BridgeMachine[];
}

export interface ListBridgeMachinesParams {
  user_id?: number;
  limit?: number;
}

export async function listAdminUsers(params: ListAdminUsersParams = {}): Promise<AdminUsersListResponse> {
  return pixsimClient.get<AdminUsersListResponse>('/admin/users', { params });
}

export async function listBridgeMachines(
  params: ListBridgeMachinesParams = {},
): Promise<BridgeMachinesResponse> {
  return pixsimClient.get<BridgeMachinesResponse>('/meta/agents/bridge/machines', { params });
}

export async function updateAdminUserPermissions(
  userId: number,
  permissions: string[],
): Promise<AdminUserPermissions> {
  return pixsimClient.put<AdminUserPermissions>(`/admin/users/${userId}/permissions`, { permissions });
}

export interface AdminUpdateUserParams {
  role?: string;
  is_active?: boolean;
  password?: string;
  permissions?: string[];
}

export async function adminUpdateUser(
  userId: number,
  params: AdminUpdateUserParams,
): Promise<AdminUserPermissions> {
  return pixsimClient.patch<AdminUserPermissions>(`/admin/users/${userId}`, params);
}

export async function adminDeactivateUser(userId: number): Promise<AdminUserPermissions> {
  return pixsimClient.delete<AdminUserPermissions>(`/admin/users/${userId}`);
}

// --- Agent-profile scope grants (scoped-agent-authorization cp5) ---------

export interface AdminAgentProfile {
  id: string;
  user_id: number;
  label: string;
  agent_type: string;
  status: string;
  is_global: boolean;
  /** Plan ids this profile may work on. null = unrestricted. */
  assigned_plans: string[] | null;
  /** Scope strings (e.g. "world:42", "world:*"). null = unrestricted. */
  default_scopes: string[] | null;
  /** Contract ids this profile may use. null = unrestricted (all for audience). */
  allowed_contracts: string[] | null;
}

export interface AdminAgentProfilesResponse {
  profiles: AdminAgentProfile[];
  total: number;
}

/** List a user's (and global) agent profiles for scope management. Admin-only. */
export async function listAdminAgentProfiles(userId?: number): Promise<AdminAgentProfilesResponse> {
  return pixsimClient.get<AdminAgentProfilesResponse>('/dev/agent-profiles/admin/all', {
    params: userId != null ? { user_id: userId } : undefined,
  });
}

export interface AdminProfileScopeParams {
  /** Omit a field to leave unchanged; pass null to clear (unrestricted); pass a list to restrict. */
  assigned_plans?: string[] | null;
  default_scopes?: string[] | null;
  allowed_contracts?: string[] | null;
  status?: string;
}

/** Grant/revoke a profile's scopes or pause it, across any owner. Admin-only. */
export async function adminUpdateAgentProfileScope(
  profileId: string,
  params: AdminProfileScopeParams,
): Promise<AdminAgentProfile> {
  return pixsimClient.patch<AdminAgentProfile>(`/dev/agent-profiles/admin/${profileId}`, params);
}

// --- Scope-option sources for the world/project pickers (agent-scope-admin-ux cp1) ---
// A scope grant is an owner-agnostic edge "this profile may act on this resource",
// so these admin-only listings resolve grantable worlds/projects ACROSS owners,
// each labelled with its owner, to populate the scope pickers. `userId` is an
// optional filter, not a fallback. Read-only: granting does not itself confer
// cross-owner access (that needs the deferred sharing layer).

/** A grantable scope resource option: id + name + which user owns it. */
export interface AdminScopeResourceOption {
  id: number;
  name: string;
  owner_user_id: number;
  owner_label: string;
}

export interface AdminWorldOptionsResponse {
  worlds: AdminScopeResourceOption[];
  total: number;
}

/** List grantable worlds across owners (owner-labelled). `userId` optionally narrows. Admin-only. */
export async function listAdminWorldOptions(userId?: number): Promise<AdminWorldOptionsResponse> {
  return pixsimClient.get<AdminWorldOptionsResponse>('/game/worlds/admin/all', {
    params: userId != null ? { user_id: userId } : undefined,
  });
}

/** List grantable (non-draft) project snapshots across owners (owner-labelled). Admin-only. */
export async function listAdminProjectOptions(userId?: number): Promise<AdminScopeResourceOption[]> {
  return pixsimClient.get<AdminScopeResourceOption[]>('/game/worlds/admin/projects', {
    params: userId != null ? { user_id: userId } : undefined,
  });
}

/** A selectable scope option: the raw grant value plus a human-resolved label. */
export interface ScopeOption {
  value: string;
  label: string;
}

/** Plan options (id + title) for the plan-scope picker. Not admin-gated. */
export async function listScopePlanOptions(): Promise<ScopeOption[]> {
  const resp = await pixsimClient.get<{ plans?: Array<{ id: string; title?: string }> }>(
    '/dev/plans',
    { params: { limit: 500, include_hidden: false } },
  );
  return (resp.plans ?? []).map((p) => ({ value: p.id, label: p.title || p.id }));
}

/** Contract options (id + name) for the contract-scope picker. Filtered by the caller's
 *  own grant server-side (cp4) — an admin is unrestricted, so sees all contracts. */
export async function listScopeContractOptions(): Promise<ScopeOption[]> {
  const resp = await pixsimClient.get<{ contracts?: Array<{ id: string; name?: string }> }>(
    '/meta/contracts',
  );
  return (resp.contracts ?? []).map((c) => ({ value: c.id, label: c.name || c.id }));
}

// --- Per-profile observability (agent-scope-admin-ux cp4) ---

export interface AgentRun {
  id: string;
  profile_id: string;
  run_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  summary?: Record<string, unknown> | null;
}

/** Recent runs for one profile (newest first), for the profile detail panel. */
export async function listAgentRuns(profileId: string, limit = 8): Promise<AgentRun[]> {
  return pixsimClient.get<AgentRun[]>('/dev/agent-profiles/runs', {
    params: { profile_id: profileId, limit },
  });
}

export interface AuditEvent {
  id: string;
  domain: string;
  entityType: string;
  entityId: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  actor: string | null;
  timestamp: string;
}

export interface AuditEventsResponse {
  events: AuditEvent[];
  total: number | null;
  limit: number;
  offset: number;
}

/** Recent scope-change audit events for one agent profile (the admin PATCH records diffs). */
export async function listProfileScopeAudit(
  profileId: string,
  limit = 8,
): Promise<AuditEventsResponse> {
  return pixsimClient.get<AuditEventsResponse>('/audit/events', {
    params: { domain: 'agent', entity_type: 'agent_profile', entity_id: profileId, limit },
  });
}

// --- Self (non-admin) reflection of own agent profiles (agent-scope-admin-ux cp5) ---
// AccountView shows the current user their OWN profiles' scopes read-only, via the
// owner-scoped endpoints (no admin gate). Label resolution uses the user's own
// worlds/projects; cross-owner grants fall back to raw ids in the summary.

/** The current user's own agent profiles (owner-scoped, non-admin). */
export async function listMyAgentProfiles(): Promise<AdminAgentProfilesResponse> {
  return pixsimClient.get<AdminAgentProfilesResponse>('/dev/agent-profiles');
}

/** The current user's own worlds as scope options, for labelling the self summary. */
export async function listMyWorldScopeOptions(): Promise<ScopeOption[]> {
  const resp = await pixsimClient.get<{ worlds?: Array<{ id: number; name: string }> }>(
    '/game/worlds/',
  );
  return (resp.worlds ?? []).map((w) => ({ value: `world:${w.id}`, label: `${w.name} (#${w.id})` }));
}

/** The current user's own saved project snapshots as scope options. */
export async function listMyProjectScopeOptions(): Promise<ScopeOption[]> {
  const resp = await pixsimClient.get<Array<{ id: number; name: string }>>(
    '/game/worlds/projects/snapshots',
  );
  return (resp ?? []).map((p) => ({ value: `project:${p.id}`, label: `${p.name} (#${p.id})` }));
}
