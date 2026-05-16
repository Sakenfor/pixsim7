/**
 * Current-user profile API (web wrapper)
 *
 * Talks to the backend `/users/me` endpoints. Only the fields the backend
 * actually accepts on PATCH (`username`, `display_name`) are editable today.
 */
import { pixsimClient } from './client';

export interface UserProfile {
  id: number;
  email: string;
  username: string;
  display_name: string | null;
  role: string;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface UpdateUserProfileParams {
  username?: string;
  display_name?: string | null;
}

export async function getCurrentUserProfile(): Promise<UserProfile> {
  return pixsimClient.get<UserProfile>('/users/me');
}

export async function updateCurrentUserProfile(
  params: UpdateUserProfileParams,
): Promise<UserProfile> {
  return pixsimClient.patch<UserProfile>('/users/me', params);
}
