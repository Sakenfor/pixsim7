import { apiClient } from '../api/client';
import type { LoginRequest, RegisterRequest, AuthResponse, User } from '../../types';

class AuthService {
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    // Send either { email, password } or { username, password }
    const { email, username, password } = credentials;
    const identifier = email ?? username ?? '';
    const payload = { email: identifier, username: identifier, password };
    const response = await apiClient.post<AuthResponse>('/auth/login', payload);

    if (response.data.access_token) {
      this.saveAuth(response.data);
    }

    return response.data;
  }

  async register(userData: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', userData);

    if (response.data.access_token) {
      this.saveAuth(response.data);
    }

    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>('/users/me');
    return response.data;
  }

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  getStoredToken(): string | null {
    return localStorage.getItem('access_token');
  }

  getStoredUser(): User | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  isAuthenticated(): boolean {
    return !!this.getStoredToken();
  }

  private saveAuth(authResponse: AuthResponse) {
    localStorage.setItem('access_token', authResponse.access_token);
    localStorage.setItem('user', JSON.stringify(authResponse.user));
  }
}

export const authService = new AuthService();
