// Auth types (re-exported from shared package)
export type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
} from '@pixsim7/shared.auth.core';

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

// Re-export game types
export * from './game';

// Re-export display types
export * from './display';
