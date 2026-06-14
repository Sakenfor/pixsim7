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
// Worlds and projects are owner-scoped; granting a collaborator's profile into one
// crosses owners, so these admin-only listings resolve another user's worlds/projects
// (id + label) to populate the scope pickers. Mirror of listAdminAgentProfiles.

export interface AdminWorldOption {
  id: number;
  name: string;
}

export interface AdminWorldOptionsResponse {
  worlds: AdminWorldOption[];
  total: number;
  offset: number;
  limit: number;
}

/** List a user's worlds (id + name) for the world-scope picker. Admin-only. */
export async function listAdminUserWorlds(userId: number): Promise<AdminWorldOptionsResponse> {
  return pixsimClient.get<AdminWorldOptionsResponse>('/game/worlds/admin/all', {
    params: { user_id: userId },
  });
}

export interface AdminProjectOption {
  id: number;
  name: string;
}

/** List a user's saved project snapshots (id + name) for the project-scope picker. Admin-only. */
export async function listAdminUserProjects(userId: number): Promise<AdminProjectOption[]> {
  return pixsimClient.get<AdminProjectOption[]>('/game/worlds/admin/projects', {
    params: { user_id: userId },
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
