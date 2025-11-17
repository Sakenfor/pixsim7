<script>
	import { onMount, onDestroy } from 'svelte';
	import * as api from '$lib/api/client';

	export let serviceKey;

	let logs = [];
	let loading = false;
	let error = null;
	let filterText = '';
	let filterLevel = '';
	let tail = 200;
	let autoScroll = true;

	let logContainer;
	let refreshInterval;

	const logLevels = ['', 'ERROR', 'WARNING', 'INFO', 'DEBUG'];

	// Detect log level from line
	function getLineLevel(line) {
		if (line.includes('[ERR]') || line.includes('[ERROR]')) return 'error';
		if (line.includes('[WARN]') || line.includes('[WARNING]')) return 'warning';
		if (line.includes('[DEBUG]')) return 'debug';
		if (line.includes('[INFO]')) return 'info';
		return 'default';
	}

	// Line colors
	const lineColors = {
		error: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
		warning: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
		debug: 'text-blue-600 dark:text-blue-400',
		info: 'text-gray-700 dark:text-gray-300',
		default: 'text-gray-600 dark:text-gray-400'
	};

	async function loadLogs() {
		if (!serviceKey) return;

		loading = true;
		error = null;

		try {
			const response = await api.getLogs(serviceKey, {
				tail,
				filter_text: filterText || undefined,
				filter_level: filterLevel || undefined
			});

			logs = response.lines;

			// Auto-scroll to bottom
			if (autoScroll && logContainer) {
				setTimeout(() => {
					logContainer.scrollTop = logContainer.scrollHeight;
				}, 50);
			}
		} catch (err) {
			error = err.message;
			console.error('Failed to load logs:', err);
		} finally {
			loading = false;
		}
	}

	async function clearLogs() {
		if (!serviceKey || !confirm('Clear logs for this service?')) return;

		try {
			await api.clearLogs(serviceKey);
			logs = [];
		} catch (err) {
			error = err.message;
		}
	}

	// Reload logs when service changes
	$: if (serviceKey) {
		loadLogs();
	}

	onMount(() => {
		// Auto-refresh logs every 2 seconds
		refreshInterval = setInterval(loadLogs, 2000);
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});
</script>

<div class="flex flex-col h-full">
	<!-- Controls -->
	<div class="flex flex-wrap items-center gap-2 p-3 bg-gray-100 dark:bg-gray-900 rounded-t-lg">
		<input
			type="text"
			placeholder="Filter text..."
			bind:value={filterText}
			on:change={loadLogs}
			class="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white"
		/>

		<select
			bind:value={filterLevel}
			on:change={loadLogs}
			class="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white"
		>
			<option value="">All levels</option>
			{#each logLevels.slice(1) as level}
				<option value={level}>{level}</option>
			{/each}
		</select>

		<input
			type="number"
			min="10"
			max="10000"
			bind:value={tail}
			on:change={loadLogs}
			class="w-24 px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white"
			placeholder="Lines"
		/>

		<label class="flex items-center gap-2 cursor-pointer">
			<input type="checkbox" bind:checked={autoScroll} />
			<span class="text-sm dark:text-white">Auto-scroll</span>
		</label>

		<button
			on:click={loadLogs}
			disabled={loading}
			class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors"
		>
			{loading ? 'Loading...' : '↻ Refresh'}
		</button>

		<button
			on:click={clearLogs}
			class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
		>
			🗑️ Clear
		</button>

		<span class="text-sm text-gray-600 dark:text-gray-400 ml-auto">
			{logs.length} lines
		</span>
	</div>

	<!-- Error message -->
	{#if error}
		<div class="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
			Error: {error}
		</div>
	{/if}

	<!-- Logs -->
	<div
		bind:this={logContainer}
		class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-3 font-mono text-sm"
	>
		{#if logs.length === 0}
			<p class="text-gray-500 dark:text-gray-400 text-center py-8">
				{loading ? 'Loading logs...' : 'No logs available'}
			</p>
		{:else}
			{#each logs as line}
				{@const level = getLineLevel(line)}
				<div class="py-1 px-2 rounded mb-1 {lineColors[level]}">
					{line}
				</div>
			{/each}
		{/if}
	</div>
</div>
