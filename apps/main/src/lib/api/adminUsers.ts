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

export async function listAdminUsers(params: ListAdminUsersParams = {}): Promise<AdminUsersListResponse> {
  return pixsimClient.get<AdminUsersListResponse>('/admin/users', { params });
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
