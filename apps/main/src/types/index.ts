// User types
export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
}

// Auth types
export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// Asset types (basic, can be expanded)
export interface Asset {
  id: string;
  user_id: string;
  type: 'image' | 'video' | 'audio' | '3d_model';
  url: string;
  thumbnail_url?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

// Scene types (basic, can be expanded)
export interface Scene {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

// API Error type
export interface ApiError {
  detail: string;
  [key: string]: any;
}

// Re-export automation types
export * from './automation';

// Re-export game types
export * from './game';

// Re-export display types
export * from './display';
