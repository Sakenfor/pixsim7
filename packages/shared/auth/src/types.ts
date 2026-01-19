/**
 * Authentication Types
 *
 * User and authentication request/response types for the auth system.
 */

/**
 * Authenticated user information
 */
export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  role?: string;
  is_admin?: boolean;
  created_at: string;
}

/**
 * Login request payload
 */
export interface LoginRequest {
  /** Email address (can use either email or username) */
  email?: string;
  /** Username (can use either email or username) */
  username?: string;
  /** User password */
  password: string;
}

/**
 * Registration request payload
 */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

/**
 * Authentication response from login/register endpoints
 */
export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}
