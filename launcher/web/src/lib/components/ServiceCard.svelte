<script>
	import { createEventDispatcher } from 'svelte';

	export let service;

	const dispatch = createEventDispatcher();

	// Status colors
	const statusColors = {
		stopped: 'bg-gray-500',
		starting: 'bg-yellow-500 animate-pulse',
		running: 'bg-green-500',
		stopping: 'bg-orange-500',
		failed: 'bg-red-500'
	};

	// Health colors
	const healthColors = {
		stopped: 'text-gray-500',
		starting: 'text-yellow-500',
		healthy: 'text-green-500',
		unhealthy: 'text-red-500',
		unknown: 'text-gray-400'
	};

	// Health icons
	const healthIcons = {
		stopped: '⚫',
		starting: '🟡',
		healthy: '🟢',
		unhealthy: '🔴',
		unknown: '⚪'
	};

	$: isRunning = service.status === 'running' || service.status === 'starting';
	$: statusColor = statusColors[service.status] || statusColors.stopped;
	$: healthColor = healthColors[service.health] || healthColors.unknown;
	$: healthIcon = healthIcons[service.health] || healthIcons.unknown;

	function handleStart() {
		dispatch('start', service.key);
	}

	function handleStop() {
		dispatch('stop', service.key);
	}

	function handleRestart() {
		dispatch('restart', service.key);
	}

	function handleSelect() {
		dispatch('select', service.key);
	}
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer border-l-4 {statusColor}"
	on:click={handleSelect}
	on:keydown={(e) => e.key === 'Enter' && handleSelect()}
	role="button"
	tabindex="0"
>
	<!-- Header -->
	<div class="flex items-center justify-between mb-3">
		<div class="flex items-center gap-2">
			<span class="text-2xl">{healthIcon}</span>
			<div>
				<h3 class="font-semibold text-lg text-gray-900 dark:text-white">
					{service.title}
				</h3>
				<p class="text-xs text-gray-500 dark:text-gray-400">{service.key}</p>
			</div>
		</div>

		<!-- Status badge -->
		<span
			class="px-3 py-1 rounded-full text-xs font-medium text-white {statusColor}"
		>
			{service.status}
		</span>
	</div>

	<!-- Health status -->
	<div class="mb-3">
		<span class="text-sm font-medium {healthColor}">
			Health: {service.health}
		</span>
		{#if service.pid}
			<span class="text-xs text-gray-500 dark:text-gray-400 ml-2">
				PID: {service.pid}
			</span>
		{/if}
	</div>

	<!-- Error message -->
	{#if service.last_error}
		<div class="mb-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-400">
			{service.last_error}
		</div>
	{/if}

	<!-- Tool availability warning -->
	{#if !service.tool_available}
		<div class="mb-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs text-yellow-700 dark:text-yellow-400">
			⚠️ {service.tool_check_message}
		</div>
	{/if}

	<!-- Action buttons -->
	<div class="flex gap-2">
		{#if !isRunning}
			<button
				on:click|stopPropagation={handleStart}
				disabled={!service.tool_available}
				class="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-2 px-4 rounded font-medium transition-colors disabled:cursor-not-allowed"
			>
				▶ Start
			</button>
		{:else}
			<button
				on:click|stopPropagation={handleStop}
				class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded font-medium transition-colors"
			>
				■ Stop
			</button>
			<button
				on:click|stopPropagation={handleRestart}
				class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded font-medium transition-colors"
			>
				↻ Restart
			</button>
		{/if}
	</div>
</div>
