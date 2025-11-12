<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  interface SystemHealth {
    status: string;
    database: string;
    redis: string;
    timestamp?: string;
  }

  let health: SystemHealth | null = null;
  let loading = true;
  let error: string | null = null;
  let autoRefresh = true;
  let refreshInterval: any;

  async function loadHealth() {
    try {
      loading = true;
      error = null;
      health = await api.getHealth();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load health status';
      health = null;
    } finally {
      loading = false;
    }
  }

  function getStatusColor(status: string): string {
    if (!status) return 'bg-gray-500';
    const normalized = status.toLowerCase();
    if (normalized === 'healthy' || normalized === 'connected' || normalized === 'ok') {
      return 'bg-green-500';
    }
    if (normalized === 'degraded' || normalized === 'warning') {
      return 'bg-yellow-500';
    }
    return 'bg-red-500';
  }

  function getStatusText(status: string): string {
    if (!status) return 'Unknown';
    const normalized = status.toLowerCase();
    if (normalized === 'healthy' || normalized === 'connected' || normalized === 'ok') {
      return 'Running';
    }
    if (normalized === 'degraded' || normalized === 'warning') {
      return 'Degraded';
    }
    return 'Stopped';
  }

  onMount(() => {
    loadHealth();

    if (autoRefresh) {
      refreshInterval = setInterval(loadHealth, 5000);
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  });

  $: {
    if (autoRefresh && !refreshInterval) {
      refreshInterval = setInterval(loadHealth, 5000);
    } else if (!autoRefresh && refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }
</script>

<div class="space-y-8">
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-4xl font-bold mb-2">System Health</h1>
      <p class="text-gray-400">Monitor PixSim7 system components</p>
    </div>
    <div class="flex items-center gap-4">
      <label class="flex items-center gap-2 text-sm text-gray-400">
        <input type="checkbox" bind:checked={autoRefresh} />
        Auto-refresh
      </label>
      <button on:click={loadHealth} class="btn btn-primary">
        Refresh
      </button>
    </div>
  </div>

  {#if error}
    <div class="bg-red-900/20 border border-red-500 rounded-lg p-4">
      <p class="text-red-400">{error}</p>
      <p class="text-sm text-gray-400 mt-2">
        Make sure the backend is running on http://localhost:8001
      </p>
    </div>
  {/if}

  {#if loading && !health}
    <p class="text-gray-400">Loading system health...</p>
  {:else if health}
    <!-- Overall Status -->
    <div class="card">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold mb-1">System Status</h2>
          <p class="text-sm text-gray-400">
            {health.timestamp ? `Last updated: ${new Date(health.timestamp).toLocaleTimeString()}` : ''}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <div class="w-4 h-4 rounded-full {getStatusColor(health.status)}"></div>
          <span class="text-2xl font-bold capitalize {
            getStatusColor(health.status).replace('bg-', 'text-')
          }">
            {getStatusText(health.status)}
          </span>
        </div>
      </div>
    </div>

    <!-- Component Status Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Backend API -->
      <div class="card">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl">🚀</span>
            <div>
              <h3 class="text-xl font-semibold">Backend API</h3>
              <p class="text-sm text-gray-400">FastAPI Server</p>
            </div>
          </div>
          <div class="w-3 h-3 rounded-full {getStatusColor(health.status)}"></div>
        </div>
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Status</span>
            <span class="capitalize text-gray-300">{getStatusText(health.status)}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Port</span>
            <span class="text-gray-300">8001</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Health Check</span>
            <a href="http://localhost:8001/health" target="_blank" class="text-blue-400 hover:underline">
              /health
            </a>
          </div>
        </div>
      </div>

      <!-- Database -->
      <div class="card">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl">🗄️</span>
            <div>
              <h3 class="text-xl font-semibold">PostgreSQL</h3>
              <p class="text-sm text-gray-400">Database Server</p>
            </div>
          </div>
          <div class="w-3 h-3 rounded-full {getStatusColor(health.database)}"></div>
        </div>
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Status</span>
            <span class="capitalize text-gray-300">{getStatusText(health.database)}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Port</span>
            <span class="text-gray-300">5434</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Type</span>
            <span class="text-gray-300">PostgreSQL 15</span>
          </div>
        </div>
      </div>

      <!-- Redis -->
      <div class="card">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl">⚡</span>
            <div>
              <h3 class="text-xl font-semibold">Redis</h3>
              <p class="text-sm text-gray-400">Cache & Queue</p>
            </div>
          </div>
          <div class="w-3 h-3 rounded-full {getStatusColor(health.redis)}"></div>
        </div>
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Status</span>
            <span class="capitalize text-gray-300">{getStatusText(health.redis)}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Port</span>
            <span class="text-gray-300">6380</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Purpose</span>
            <span class="text-gray-300">Job Queue</span>
          </div>
        </div>
      </div>
    </div>

    <!-- System Information -->
    <div class="card">
      <h2 class="text-xl font-bold mb-4">System Information</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p class="text-sm text-gray-400 mb-1">Backend URL</p>
          <p class="text-gray-300 font-mono text-sm">localhost:8001</p>
        </div>
        <div>
          <p class="text-sm text-gray-400 mb-1">Admin Panel</p>
          <p class="text-gray-300 font-mono text-sm">localhost:5173</p>
        </div>
        <div>
          <p class="text-sm text-gray-400 mb-1">PostgreSQL</p>
          <p class="text-gray-300 font-mono text-sm">localhost:5434</p>
        </div>
        <div>
          <p class="text-sm text-gray-400 mb-1">Redis</p>
          <p class="text-gray-300 font-mono text-sm">localhost:6380</p>
        </div>
      </div>
    </div>

    <!-- Component Details -->
    <div class="card">
      <h2 class="text-xl font-bold mb-4">Component Details</h2>
      <div class="space-y-4">
        <div class="p-4 bg-gray-800 rounded-lg">
          <h3 class="font-semibold mb-2">🚀 Backend API</h3>
          <p class="text-sm text-gray-400 mb-2">
            FastAPI server handling all API requests. Should be running on port 8001.
          </p>
          <code class="text-xs bg-gray-900 px-2 py-1 rounded text-gray-300">
            python -m uvicorn pixsim7_backend.main:app --host 0.0.0.0 --port 8001
          </code>
        </div>

        <div class="p-4 bg-gray-800 rounded-lg">
          <h3 class="font-semibold mb-2">⚙️ ARQ Worker</h3>
          <p class="text-sm text-gray-400 mb-2">
            Background worker processing jobs and polling status. Should be running separately.
          </p>
          <code class="text-xs bg-gray-900 px-2 py-1 rounded text-gray-300">
            arq pixsim7_backend.workers.arq_worker.WorkerSettings
          </code>
        </div>

        <div class="p-4 bg-gray-800 rounded-lg">
          <h3 class="font-semibold mb-2">🗄️ PostgreSQL</h3>
          <p class="text-sm text-gray-400 mb-2">
            Database server (Docker). Stores users, jobs, assets, and accounts.
          </p>
          <code class="text-xs bg-gray-900 px-2 py-1 rounded text-gray-300">
            docker-compose up -d postgres
          </code>
        </div>

        <div class="p-4 bg-gray-800 rounded-lg">
          <h3 class="font-semibold mb-2">⚡ Redis</h3>
          <p class="text-sm text-gray-400 mb-2">
            Redis server (Docker). Used for job queue and caching.
          </p>
          <code class="text-xs bg-gray-900 px-2 py-1 rounded text-gray-300">
            docker-compose up -d redis
          </code>
        </div>
      </div>
    </div>

    <!-- API Endpoints -->
    <div class="card">
      <h2 class="text-xl font-bold mb-4">API Endpoints</h2>
      <div class="space-y-2">
        <a href="http://localhost:8001/docs" target="_blank" class="block p-3 bg-gray-800 rounded hover:bg-gray-700 transition">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold">API Documentation</p>
              <p class="text-sm text-gray-400">Interactive Swagger UI</p>
            </div>
            <span class="text-blue-400">→</span>
          </div>
        </a>
        <a href="http://localhost:8001/health" target="_blank" class="block p-3 bg-gray-800 rounded hover:bg-gray-700 transition">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold">Health Check</p>
              <p class="text-sm text-gray-400">System status JSON</p>
            </div>
            <span class="text-blue-400">→</span>
          </div>
        </a>
      </div>
    </div>
  {/if}
</div>
