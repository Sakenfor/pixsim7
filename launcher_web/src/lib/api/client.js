/**
 * API Client - Communicates with launcher REST API
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8100';

/**
 * Make API request
 * @param {string} endpoint
 * @param {object} options
 */
async function request(endpoint, options = {}) {
	const url = `${API_BASE}${endpoint}`;

	const response = await fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options.headers
		}
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: response.statusText }));
		throw new Error(error.error || error.detail || 'API request failed');
	}

	return response.json();
}

// ============================================================================
// Services
// ============================================================================

export async function getServices() {
	return request('/services');
}

export async function getService(serviceKey) {
	return request(`/services/${serviceKey}`);
}

export async function startService(serviceKey) {
	return request(`/services/${serviceKey}/start`, { method: 'POST' });
}

export async function stopService(serviceKey, graceful = true) {
	return request(`/services/${serviceKey}/stop`, {
		method: 'POST',
		body: JSON.stringify({ graceful })
	});
}

export async function restartService(serviceKey) {
	return request(`/services/${serviceKey}/restart`, { method: 'POST' });
}

export async function startAllServices() {
	return request('/services/start-all', { method: 'POST' });
}

export async function stopAllServices(graceful = true) {
	return request('/services/stop-all', {
		method: 'POST',
		body: JSON.stringify({ graceful })
	});
}

// ============================================================================
// Logs
// ============================================================================

export async function getLogs(serviceKey, options = {}) {
	const params = new URLSearchParams();

	if (options.tail) params.append('tail', options.tail);
	if (options.filter_text) params.append('filter_text', options.filter_text);
	if (options.filter_level) params.append('filter_level', options.filter_level);

	return request(`/logs/${serviceKey}?${params}`);
}

export async function clearLogs(serviceKey) {
	return request(`/logs/${serviceKey}`, { method: 'DELETE' });
}

export async function clearAllLogs() {
	return request('/logs', { method: 'DELETE' });
}

// ============================================================================
// Health & Stats
// ============================================================================

export async function getHealth() {
	return request('/health');
}

export async function getStats() {
	return request('/stats');
}

export async function getEventStats() {
	return request('/events/stats');
}
