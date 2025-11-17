<script>
	import { onMount } from 'svelte';
	import ServiceCard from '$lib/components/ServiceCard.svelte';
	import LogViewer from '$lib/components/LogViewer.svelte';
	import { services, loading, error, selectedService, runningCount, healthyCount, loadServices, startService, stopService, restartService, startAll, stopAll } from '$lib/stores/services';
	import { wsConnected, events } from '$lib/stores/websocket';

	let showLogs = false;

	// Load services on mount
	onMount(() => {
		loadServices();

		// Refresh services every 5 seconds
		const interval = setInterval(loadServices, 5000);

		return () => clearInterval(interval);
	});

	async function handleStart(event) {
		const serviceKey = event.detail;
		try {
			await startService(serviceKey);
		} catch (err) {
			console.error('Failed to start service:', err);
		}
	}

	async function handleStop(event) {
		const serviceKey = event.detail;
		try {
			await stopService(serviceKey);
		} catch (err) {
			console.error('Failed to stop service:', err);
		}
	}

	async function handleRestart(event) {
		const serviceKey = event.detail;
		try {
			await restartService(serviceKey);
		} catch (err) {
			console.error('Failed to restart service:', err);
		}
	}

	function handleSelect(event) {
		const serviceKey = event.detail;
		selectedService.set(serviceKey);
		showLogs = true;
	}

	async function handleStartAll() {
		try {
			await startAll();
		} catch (err) {
			console.error('Failed to start all:', err);
		}
	}

	async function handleStopAll() {
		if (!confirm('Stop all running services?')) return;

		try {
			await stopAll();
		} catch (err) {
			console.error('Failed to stop all:', err);
		}
	}

	function toggleLogs() {
		showLogs = !showLogs;
	}
</script>

<svelte:head>
	<title>PixSim7 Launcher</title>
</svelte:head>

<div class="min-h-screen bg-gray-100 dark:bg-gray-950">
	<!-- Header -->
	<header class="bg-white dark:bg-gray-900 shadow-md">
		<div class="container mx-auto px-4 py-4">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold text-gray-900 dark:text-white">
						PixSim7 Launcher
					</h1>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Web Interface
					</p>
				</div>

				<!-- Stats -->
				<div class="flex items-center gap-6">
					<div class="text-center">
						<div class="text-2xl font-bold text-gray-900 dark:text-white">
							{$runningCount}/{$services.length}
						</div>
						<div class="text-xs text-gray-600 dark:text-gray-400">Running</div>
					</div>
					<div class="text-center">
						<div class="text-2xl font-bold text-green-600 dark:text-green-400">
							{$healthyCount}
						</div>
						<div class="text-xs text-gray-600 dark:text-gray-400">Healthy</div>
					</div>
					<div class="text-center">
						<div class="text-lg">
							{$wsConnected ? '🟢' : '🔴'}
						</div>
						<div class="text-xs text-gray-600 dark:text-gray-400">
							{$wsConnected ? 'Live' : 'Offline'}
						</div>
					</div>
				</div>
			</div>

			<!-- Global controls -->
			<div class="flex gap-2 mt-4">
				<button
					on:click={handleStartAll}
					disabled={$loading}
					class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
				>
					▶ Start All
				</button>
				<button
					on:click={handleStopAll}
					disabled={$loading}
					class="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
				>
					■ Stop All
				</button>
				<button
					on:click={loadServices}
					disabled={$loading}
					class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
				>
					↻ Refresh
				</button>
				<button
					on:click={toggleLogs}
					class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 ml-auto"
				>
					📝 {showLogs ? 'Hide' : 'Show'} Logs
				</button>
			</div>
		</div>
	</header>

	<!-- Main content -->
	<main class="container mx-auto px-4 py-6">
		<!-- Error message -->
		{#if $error}
			<div class="mb-4 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
				{$error}
			</div>
		{/if}

		<!-- Loading state -->
		{#if $loading && $services.length === 0}
			<div class="text-center py-12">
				<div class="text-gray-600 dark:text-gray-400">Loading services...</div>
			</div>
		{:else}
			<!-- Services grid -->
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
				{#each $services as service (service.key)}
					<ServiceCard
						{service}
						on:start={handleStart}
						on:stop={handleStop}
						on:restart={handleRestart}
						on:select={handleSelect}
					/>
				{/each}
			</div>

			<!-- Logs panel -->
			{#if showLogs && $selectedService}
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden" style="height: 500px;">
					<div class="p-3 bg-gray-200 dark:bg-gray-900 font-semibold text-gray-900 dark:text-white">
						Logs: {$selectedService}
					</div>
					<LogViewer serviceKey={$selectedService} />
				</div>
			{/if}
		{/if}

		<!-- Recent events (debug) -->
		{#if $events.length > 0}
			<details class="mt-6">
				<summary class="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
					Recent Events ({$events.length})
				</summary>
				<div class="mt-2 bg-white dark:bg-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto">
					{#each $events.slice(-10).reverse() as event}
						<div class="mb-2 text-xs font-mono text-gray-600 dark:text-gray-400">
							<span class="text-blue-600 dark:text-blue-400">{event.event_type}</span> -
							{new Date(event.timestamp * 1000).toLocaleTimeString()}
						</div>
					{/each}
				</div>
			</details>
		{/if}
	</main>

	<!-- Footer -->
	<footer class="mt-12 py-4 text-center text-gray-600 dark:text-gray-400 text-sm">
		<p>PixSim7 Launcher Web UI v0.2.0</p>
		<p class="mt-1">
			Powered by <a href="http://localhost:8100/docs" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline">Launcher API</a>
		</p>
	</footer>
</div>
