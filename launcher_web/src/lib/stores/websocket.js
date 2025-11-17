/**
 * WebSocket Store - Real-time event streaming from API
 */

import { writable } from 'svelte/store';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8100/events/ws';

// Store for WebSocket connection status
export const wsConnected = writable(false);

// Store for latest events
export const events = writable([]);

// Store for service states (updated from events)
export const serviceStates = writable({});

let ws = null;
let reconnectTimer = null;
let maxEvents = 100; // Keep last 100 events

/**
 * Connect to WebSocket
 */
export function connectWebSocket() {
	if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
		console.log('[WS] Already connected or connecting');
		return;
	}

	console.log('[WS] Connecting to', WS_URL);

	ws = new WebSocket(WS_URL);

	ws.onopen = () => {
		console.log('[WS] Connected');
		wsConnected.set(true);

		// Clear reconnect timer
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	};

	ws.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);

			// Add to events list
			events.update((list) => {
				const updated = [...list, data];
				return updated.slice(-maxEvents); // Keep last N events
			});

			// Update service states based on events
			if (data.event_type === 'health.update') {
				const healthData = data.data;
				serviceStates.update((states) => ({
					...states,
					[healthData.service_key]: {
						...states[healthData.service_key],
						health: healthData.status
					}
				}));
			} else if (data.event_type === 'process.started') {
				const procData = data.data;
				serviceStates.update((states) => ({
					...states,
					[procData.service_key]: {
						...states[procData.service_key],
						status: 'running'
					}
				}));
			} else if (data.event_type === 'process.stopped') {
				const procData = data.data;
				serviceStates.update((states) => ({
					...states,
					[procData.service_key]: {
						...states[procData.service_key],
						status: 'stopped'
					}
				}));
			}
		} catch (error) {
			console.error('[WS] Error parsing message:', error);
		}
	};

	ws.onclose = () => {
		console.log('[WS] Disconnected');
		wsConnected.set(false);

		// Auto-reconnect after 3 seconds
		reconnectTimer = setTimeout(() => {
			console.log('[WS] Attempting to reconnect...');
			connectWebSocket();
		}, 3000);
	};

	ws.onerror = (error) => {
		console.error('[WS] Error:', error);
		wsConnected.set(false);
	};
}

/**
 * Disconnect WebSocket
 */
export function disconnectWebSocket() {
	if (ws) {
		ws.close();
		ws = null;
	}

	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}

	wsConnected.set(false);
}

/**
 * Send ping to keep connection alive
 */
export function sendPing() {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ type: 'ping' }));
	}
}

// Auto-connect when module loads (browser only)
if (typeof window !== 'undefined') {
	connectWebSocket();

	// Send ping every 30 seconds to keep connection alive
	setInterval(sendPing, 30000);
}
