/**
 * Services Store - Manages service state
 */

import { writable, derived } from 'svelte/store';
import * as api from '$lib/api/client';

// Store for all services
export const services = writable([]);

// Store for loading state
export const loading = writable(false);

// Store for errors
export const error = writable(null);

// Store for selected service
export const selectedService = writable(null);

// Derived store: running services count
export const runningCount = derived(services, ($services) =>
	$services.filter((s) => s.status === 'running' || s.status === 'starting').length
);

// Derived store: healthy services count
export const healthyCount = derived(services, ($services) =>
	$services.filter((s) => s.health === 'healthy').length
);

/**
 * Load all services from API
 */
export async function loadServices() {
	loading.set(true);
	error.set(null);

	try {
		const response = await api.getServices();
		services.set(response.services);
	} catch (err) {
		error.set(err.message);
		console.error('Failed to load services:', err);
	} finally {
		loading.set(false);
	}
}

/**
 * Refresh a single service
 */
export async function refreshService(serviceKey) {
	try {
		const service = await api.getService(serviceKey);

		services.update((list) =>
			list.map((s) => (s.key === serviceKey ? service : s))
		);
	} catch (err) {
		console.error(`Failed to refresh service ${serviceKey}:`, err);
	}
}

/**
 * Start a service
 */
export async function startService(serviceKey) {
	try {
		await api.startService(serviceKey);
		await refreshService(serviceKey);
	} catch (err) {
		error.set(`Failed to start ${serviceKey}: ${err.message}`);
		throw err;
	}
}

/**
 * Stop a service
 */
export async function stopService(serviceKey, graceful = true) {
	try {
		await api.stopService(serviceKey, graceful);
		await refreshService(serviceKey);
	} catch (err) {
		error.set(`Failed to stop ${serviceKey}: ${err.message}`);
		throw err;
	}
}

/**
 * Restart a service
 */
export async function restartService(serviceKey) {
	try {
		await api.restartService(serviceKey);
		await refreshService(serviceKey);
	} catch (err) {
		error.set(`Failed to restart ${serviceKey}: ${err.message}`);
		throw err;
	}
}

/**
 * Start all services
 */
export async function startAll() {
	try {
		await api.startAllServices();
		await loadServices();
	} catch (err) {
		error.set(`Failed to start all: ${err.message}`);
		throw err;
	}
}

/**
 * Stop all services
 */
export async function stopAll(graceful = true) {
	try {
		await api.stopAllServices(graceful);
		await loadServices();
	} catch (err) {
		error.set(`Failed to stop all: ${err.message}`);
		throw err;
	}
}
