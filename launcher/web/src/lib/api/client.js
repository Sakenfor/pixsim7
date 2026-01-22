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

// ============================================================================
// Buildables
// ============================================================================

export async function getBuildables() {
	return request('/buildables');
}

// ============================================================================
// Console Field Metadata
// ============================================================================

/**
 * Get console field metadata from backend API.
 * This metadata defines which log fields should be clickable and how to render them.
 *
 * Falls back to default fields if backend is unavailable.
 *
 * @returns {Promise<Array>} Array of field definitions
 */
export async function getConsoleFields() {
	try {
		// Try to fetch from backend API
		const backendUrl = 'http://localhost:8000';
		const response = await fetch(`${backendUrl}/api/v1/logs/console-fields`);

		if (response.ok) {
			const data = await response.json();
			return data.fields || [];
		}
	} catch (err) {
		console.warn('Failed to fetch console fields from backend, using defaults:', err);
	}

	// Fallback to default fields
	return [
		{
			name: 'request_id',
			color: '#FFB74D',
			clickable: true,
			pattern: 'request_id=(\\S+)',
			description: 'API request correlation ID'
		},
		{
			name: 'job_id',
			color: '#4DD0E1',
			clickable: true,
			pattern: 'job_id=(\\S+)',
			description: 'Background job identifier'
		},
		{
			name: 'submission_id',
			color: '#FFB74D',
			clickable: true,
			pattern: 'submission_id=(\\S+)',
			description: 'Provider submission identifier'
		},
		{
			name: 'generation_id',
			color: '#FFB74D',
			clickable: true,
			pattern: 'generation_id=(\\S+)',
			description: 'Asset generation identifier'
		},
		{
			name: 'provider_id',
			color: '#4DD0E1',
			clickable: true,
			pattern: 'provider_id=(\\S+)',
			description: 'AI provider identifier'
		},
		{
			name: 'error_type',
			color: '#EF5350',
			clickable: false,
			pattern: 'error_type=(\\S+)',
			description: 'Error classification'
		}
	];
}
