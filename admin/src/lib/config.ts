/**
 * Centralized API Configuration
 *
 * IMPORTANT FOR AI ASSISTANTS AND DEVELOPERS:
 * ==========================================
 * The backend API runs on PORT 8001 (not 8000!)
 *
 * This is configured in:
 * - Backend: pixsim7_backend/.env (BACKEND_PORT=8001)
 * - Frontend: admin/.env (VITE_API_URL=http://localhost:8001/api/v1)
 *
 * Always use the environment variable or this constant.
 * DO NOT hardcode port 8000 anywhere!
 */

// Backend API base URL (without /api/v1 suffix)
// Used for admin endpoints that don't follow the /api/v1 pattern
export const API_BASE_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8001';

// Full API URL with /api/v1 prefix (for standard endpoints)
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1';

// API base for admin endpoints (includes /api but not /v1)
export const ADMIN_API_BASE = `${API_BASE_URL}/api`;

// Port configuration
export const BACKEND_PORT = 8001; // ⚠️ Backend runs on 8001, NOT 8000!
export const FRONTEND_PORT = 5173; // Admin panel (SvelteKit dev server)
