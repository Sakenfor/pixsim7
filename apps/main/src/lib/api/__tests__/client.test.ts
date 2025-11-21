/**
 * API Client Tests
 *
 * Regression tests for 401 handling and login redirect logic.
 * Part of Phase 31.3 - Auth Redirect & 401 Handling Guardrails.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock window.location
const mockLocation = {
  href: '',
  pathname: '/',
  search: '',
  hash: '',
  host: 'localhost:3000',
  hostname: 'localhost',
  origin: 'http://localhost:3000',
  port: '3000',
  protocol: 'http:',
  assign: vi.fn(),
  reload: vi.fn(),
  replace: vi.fn(),
};

describe('ApiClient 401 Handling', () => {
  let mock: MockAdapter;
  let originalLocation: Location;
  let redirectCount = 0;

  beforeEach(() => {
    // Save original location
    originalLocation = window.location;

    // Mock window.location
    redirectCount = 0;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...mockLocation,
        href: '',
        pathname: '/',
        get href() {
          return this._href || '/';
        },
        set href(value: string) {
          redirectCount++;
          this._href = value;
        },
      },
    });

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      value: localStorageMock,
    });

    // Create mock adapter for axios
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    // Restore original location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });

    // Reset axios mock
    mock.restore();

    // Reset modules to clear ApiClient instance
    vi.resetModules();
  });

  it('should redirect to /login on single 401 response', async () => {
    // Setup: Mock 401 response
    mock.onGet('/api/v1/test').reply(401);

    // Import ApiClient after mocks are set up
    const { apiClient } = await import('../client');

    // Execute: Make request that returns 401
    try {
      await apiClient.get('/test');
    } catch (error) {
      // Expected to throw
    }

    // Assert: Should redirect to /login exactly once
    expect(redirectCount).toBe(1);
    expect(window.location.href).toBe('/login');
    expect(localStorage.removeItem).toHaveBeenCalledWith('access_token');
    expect(localStorage.removeItem).toHaveBeenCalledWith('user');
  });

  it('should redirect only once when multiple parallel 401s occur', async () => {
    // Setup: Mock multiple endpoints returning 401
    mock.onGet('/api/v1/endpoint1').reply(401);
    mock.onGet('/api/v1/endpoint2').reply(401);
    mock.onGet('/api/v1/endpoint3').reply(401);

    // Import ApiClient after mocks are set up
    const { apiClient } = await import('../client');

    // Execute: Make multiple parallel requests that all return 401
    const requests = [
      apiClient.get('/endpoint1').catch(() => {}),
      apiClient.get('/endpoint2').catch(() => {}),
      apiClient.get('/endpoint3').catch(() => {}),
    ];

    await Promise.all(requests);

    // Assert: Should redirect to /login exactly once despite multiple 401s
    expect(redirectCount).toBe(1);
    expect(window.location.href).toBe('/login');
  });

  it('should not redirect if already on /login page', async () => {
    // Setup: Already on login page
    Object.defineProperty(window.location, 'pathname', {
      writable: true,
      value: '/login',
    });

    // Mock 401 response
    mock.onGet('/api/v1/test').reply(401);

    // Import ApiClient after mocks are set up
    const { apiClient } = await import('../client');

    // Execute: Make request that returns 401
    try {
      await apiClient.get('/test');
    } catch (error) {
      // Expected to throw
    }

    // Assert: Should NOT redirect (already on login)
    expect(redirectCount).toBe(0);
  });

  it('should not redirect if already on /login/callback page', async () => {
    // Setup: On a login-related page
    Object.defineProperty(window.location, 'pathname', {
      writable: true,
      value: '/login/callback',
    });

    // Mock 401 response
    mock.onGet('/api/v1/test').reply(401);

    // Import ApiClient after mocks are set up
    const { apiClient } = await import('../client');

    // Execute: Make request that returns 401
    try {
      await apiClient.get('/test');
    } catch (error) {
      // Expected to throw
    }

    // Assert: Should NOT redirect (already on login path)
    expect(redirectCount).toBe(0);
  });

  it('should handle non-401 errors normally', async () => {
    // Setup: Mock 500 response
    mock.onGet('/api/v1/test').reply(500, { error: 'Server error' });

    // Import ApiClient after mocks are set up
    const { apiClient } = await import('../client');

    // Execute: Make request that returns 500
    let errorThrown = false;
    try {
      await apiClient.get('/test');
    } catch (error) {
      errorThrown = true;
    }

    // Assert: Should throw error but NOT redirect
    expect(errorThrown).toBe(true);
    expect(redirectCount).toBe(0);
  });

  it('should handle successful requests without redirecting', async () => {
    // Setup: Mock successful response
    mock.onGet('/api/v1/test').reply(200, { data: 'success' });

    // Import ApiClient after mocks are set up
    const { apiClient } = await import('../client');

    // Execute: Make successful request
    const response = await apiClient.get('/test');

    // Assert: Should complete successfully without redirect
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ data: 'success' });
    expect(redirectCount).toBe(0);
  });

  it('invariant: redirect flag persists across multiple 401s in sequence', async () => {
    // Setup: Mock 401 responses
    mock.onGet('/api/v1/test1').reply(401);
    mock.onGet('/api/v1/test2').reply(401);

    // Import ApiClient after mocks are set up
    const { apiClient } = await import('../client');

    // Execute: Make first request (should redirect)
    try {
      await apiClient.get('/test1');
    } catch (error) {
      // Expected
    }

    // Execute: Make second request (should NOT redirect again)
    try {
      await apiClient.get('/test2');
    } catch (error) {
      // Expected
    }

    // Assert: Only one redirect despite two sequential 401s
    expect(redirectCount).toBe(1);
    expect(window.location.href).toBe('/login');
  });
});
