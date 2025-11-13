<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, type LogEntry, type LogQueryResponse } from '$lib/api/client';
  import { format } from 'date-fns';

  // Filter state
  let level = '';
  let logger = '';
  let search = '';
  let user_id = '';
  let job_id = '';

  // Pagination
  let limit = 100;
  let offset = 0;
  let total = 0;

  // Data
  let logs: LogEntry[] = [];
  let loading = false;
  let error: string | null = null;

  // Auto-refresh
  let autoRefresh = false;
  let refreshInterval: number | null = null;

  // Live tail (WebSocket)
  let liveTail = false;
  let ws: WebSocket | null = null;
  let wsConnected = false;
  let wsError: string | null = null;

  // Available log levels
  const logLevels = ['', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];

  // Stats
  let levelCounts = { DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0, CRITICAL: 0 };

  // Color mapping for log levels
  function getLogLevelColor(level: string): string {
    const colors: Record<string, string> = {
      'DEBUG': 'text-gray-400',
      'INFO': 'text-blue-400',
      'WARNING': 'text-yellow-400',
      'ERROR': 'text-red-400',
      'CRITICAL': 'text-red-600 font-bold',
    };
    return colors[level] || 'text-gray-300';
  }

  function getLogLevelBgColor(level: string): string {
    const colors: Record<string, string> = {
      'DEBUG': 'bg-gray-800/50 hover:bg-gray-700/70',
      'INFO': 'bg-blue-950/30 hover:bg-blue-900/40',
      'WARNING': 'bg-yellow-950/30 hover:bg-yellow-900/40 border-l-2 border-yellow-600',
      'ERROR': 'bg-red-950/40 hover:bg-red-900/50 border-l-2 border-red-600',
      'CRITICAL': 'bg-red-950/60 hover:bg-red-900/70 border-l-4 border-red-500',
    };
    return colors[level] || 'bg-gray-800 hover:bg-gray-700';
  }

  function getLevelBadgeClass(level: string): string {
    const classes: Record<string, string> = {
      'DEBUG': 'bg-gray-700 text-gray-300',
      'INFO': 'bg-blue-900/50 text-blue-300',
      'WARNING': 'bg-yellow-900/50 text-yellow-300',
      'ERROR': 'bg-red-900/50 text-red-300',
      'CRITICAL': 'bg-red-800 text-red-200 font-bold',
    };
    return classes[level] || 'bg-gray-700 text-gray-300';
  }

  async function loadLogs() {
    try {
      loading = true;
      error = null;

      const params: any = {
        limit,
        offset,
      };

      if (level) params.level = level;
      if (logger) params.logger = logger;
      if (search) params.search = search;
      if (user_id) params.user_id = parseInt(user_id);
      if (job_id) params.job_id = parseInt(job_id);

      const response: LogQueryResponse = await api.getLogs(params);
      logs = response.logs;
      total = response.total;

      // Calculate level counts
      levelCounts = { DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0, CRITICAL: 0 };
      logs.forEach(log => {
        if (log.level in levelCounts) {
          levelCounts[log.level as keyof typeof levelCounts]++;
        }
      });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load logs';
    } finally {
      loading = false;
    }
  }

  function clearFilters() {
    level = '';
    logger = '';
    search = '';
    user_id = '';
    job_id = '';
    offset = 0;
    loadLogs();
  }

  function quickFilter(filterLevel: string) {
    level = filterLevel;
    offset = 0;
    loadLogs();
  }

  function nextPage() {
    if (offset + limit < total) {
      offset += limit;
      loadLogs();
    }
  }

  function prevPage() {
    if (offset > 0) {
      offset = Math.max(0, offset - limit);
      loadLogs();
    }
  }

  function formatTimestamp(timestamp: string): string {
    try {
      return format(new Date(timestamp), 'MMM dd HH:mm:ss.SSS');
    } catch {
      return timestamp;
    }
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;

    if (autoRefresh) {
      refreshInterval = window.setInterval(loadLogs, 5000);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function toggleLiveTail() {
    liveTail = !liveTail;

    if (liveTail) {
      connectWebSocket();
      // Disable auto-refresh when live tail is on
      if (autoRefresh) {
        autoRefresh = false;
        if (refreshInterval) {
          clearInterval(refreshInterval);
          refreshInterval = null;
        }
      }
    } else {
      disconnectWebSocket();
    }
  }

  function connectWebSocket() {
    try {
      const wsUrl = 'ws://localhost:8001/api/v1/admin/logs/stream';
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        wsConnected = true;
        wsError = null;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'connected') {
            wsConnected = true;
          } else if (data.type === 'log') {
            // Add new log to the beginning (newest first)
            logs = [data.data, ...logs];

            // Update level counts
            const lvl = data.data.level.replace(/<[^>]*>/g, '').trim();
            if (lvl in levelCounts) {
              levelCounts[lvl as keyof typeof levelCounts]++;
            }

            // Keep only last 500 logs in memory
            if (logs.length > 500) {
              logs = logs.slice(0, 500);
            }
          } else if (data.type === 'error') {
            wsError = data.message;
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (err) => {
        wsError = 'WebSocket connection error';
        wsConnected = false;
      };

      ws.onclose = () => {
        wsConnected = false;
        // Auto-reconnect if live tail is still enabled
        if (liveTail) {
          setTimeout(() => {
            if (liveTail) connectWebSocket();
          }, 3000);
        }
      };
    } catch (e) {
      wsError = e instanceof Error ? e.message : 'Failed to connect';
      wsConnected = false;
    }
  }

  function disconnectWebSocket() {
    if (ws) {
      ws.close();
      ws = null;
    }
    wsConnected = false;
  }

  // Expand log entry
  let expandedLogIndex: number | null = null;

  function toggleExpand(index: number) {
    expandedLogIndex = expandedLogIndex === index ? null : index;
  }

  onMount(() => {
    loadLogs();
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    disconnectWebSocket();
  });
</script>

<div class="space-y-6">
  <!-- Quick Filters -->
  <div class="flex flex-wrap gap-3">
    <button
      on:click={() => quickFilter('')}
      class="px-4 py-2 rounded-lg transition {level === '' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
    >
      All Logs
    </button>
    <button
      on:click={() => quickFilter('ERROR')}
      class="px-4 py-2 rounded-lg transition {level === 'ERROR' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
    >
      🔴 Errors Only
    </button>
    <button
      on:click={() => quickFilter('WARNING')}
      class="px-4 py-2 rounded-lg transition {level === 'WARNING' ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
    >
      ⚠️ Warnings
    </button>
    <button
      on:click={() => quickFilter('INFO')}
      class="px-4 py-2 rounded-lg transition {level === 'INFO' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
    >
      ℹ️ Info
    </button>
    <button
      on:click={() => quickFilter('DEBUG')}
      class="px-4 py-2 rounded-lg transition {level === 'DEBUG' ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
    >
      🐛 Debug
    </button>
  </div>

  <!-- Level Statistics -->
  {#if logs.length > 0}
    <div class="grid grid-cols-5 gap-3">
      {#each Object.entries(levelCounts) as [lvl, count]}
        <div class="card text-center">
          <p class="text-2xl font-bold {getLogLevelColor(lvl)}">{count}</p>
          <p class="text-xs text-gray-400 mt-1">{lvl}</p>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Advanced Filters -->
  <div class="card">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-bold">Advanced Filters</h2>
      <button on:click={clearFilters} class="text-sm text-blue-400 hover:underline">
        Clear All
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Logger -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Logger
        </label>
        <input
          type="text"
          bind:value={logger}
          placeholder="e.g., main, auth_service"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <!-- User ID -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          User ID
        </label>
        <input
          type="number"
          bind:value={user_id}
          placeholder="Filter by user"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <!-- Job ID -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Job ID
        </label>
        <input
          type="number"
          bind:value={job_id}
          placeholder="Filter by job"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <!-- Search -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Search
        </label>
        <input
          type="text"
          bind:value={search}
          placeholder="Search messages..."
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>

    <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
      <button
        on:click={loadLogs}
        class="btn btn-primary"
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Apply Filters'}
      </button>

      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={liveTail}
            on:change={toggleLiveTail}
            class="w-4 h-4"
          />
          <span class="text-sm text-gray-300 flex items-center gap-1">
            🔴 Live Tail
            {#if wsConnected}
              <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            {/if}
          </span>
        </label>

        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            on:change={toggleAutoRefresh}
            disabled={liveTail}
            class="w-4 h-4"
          />
          <span class="text-sm text-gray-300">Auto-refresh (5s)</span>
        </label>

        <span class="text-sm text-gray-400">
          {liveTail ? `${logs.length} logs (live)` : `Total: ${total} logs`}
        </span>
      </div>
    </div>
  </div>

  <!-- Error Display -->
  {#if error}
    <div class="bg-red-900/20 border border-red-500 rounded-lg p-4">
      <p class="text-red-400">{error}</p>
    </div>
  {/if}

  <!-- WebSocket Status -->
  {#if liveTail && wsError}
    <div class="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4">
      <p class="text-yellow-400">⚠️ Live tail connection issue: {wsError}</p>
      <p class="text-sm text-gray-400 mt-1">Attempting to reconnect...</p>
    </div>
  {/if}

  {#if liveTail && wsConnected}
    <div class="bg-green-900/20 border border-green-500 rounded-lg p-3 flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
      <p class="text-green-400 text-sm">Live tail connected - watching for new logs...</p>
    </div>
  {/if}

  <!-- Log Entries -->
  <div class="card">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold">Log Entries</h2>
      <span class="text-sm text-gray-400">
        Showing {offset + 1}-{Math.min(offset + logs.length, total)} of {total}
      </span>
    </div>

    {#if loading && logs.length === 0}
      <div class="text-center py-8 text-gray-400">
        Loading logs...
      </div>
    {:else if logs.length === 0}
      <div class="text-center py-8 text-gray-400">
        No logs found. Try adjusting your filters.
      </div>
    {:else}
      <div class="space-y-1 font-mono text-sm">
        {#each logs as log, i}
          <div
            class="rounded-lg p-3 cursor-pointer transition-all {getLogLevelBgColor(log.level)}"
            on:click={() => toggleExpand(i)}
          >
            <!-- Compact view -->
            <div class="flex items-start gap-3">
              <!-- Level badge -->
              <span class="shrink-0 px-2 py-1 text-xs rounded font-semibold {getLevelBadgeClass(log.level)}">
                {@html log.level}
              </span>

              <!-- Timestamp -->
              <span class="text-gray-400 shrink-0 text-xs">
                {formatTimestamp(log.timestamp)}
              </span>

              <!-- Logger -->
              <span class="text-gray-400 shrink-0 text-xs truncate max-w-[120px]" title={log.logger}>
                {@html log.logger}
              </span>

              <!-- Message (with HTML colors from ANSI codes) -->
              <span class="flex-1">
                {@html log.message}
              </span>

              <!-- Metadata badges -->
              <div class="flex gap-1 shrink-0">
                {#if log.user_id}
                  <span class="badge bg-purple-900/50 text-purple-300" title="User ID">
                    U:{log.user_id}
                  </span>
                {/if}
                {#if log.job_id}
                  <span class="badge bg-green-900/50 text-green-300" title="Job ID">
                    J:{log.job_id}
                  </span>
                {/if}
                {#if log.exception}
                  <span class="badge bg-red-900/50 text-red-300 font-bold" title="Has exception">
                    ⚠
                  </span>
                {/if}
              </div>
            </div>

            <!-- Expanded view -->
            {#if expandedLogIndex === i}
              <div class="mt-3 pt-3 border-t border-gray-600 space-y-2 text-xs">
                {#if log.module || log.function}
                  <div class="flex gap-2">
                    <span class="text-gray-500 w-24">Location:</span>
                    <span class="text-gray-300">
                      {log.module || '?'} → {log.function || '?'}:{log.line || '?'}
                    </span>
                  </div>
                {/if}

                {#if log.exception}
                  <div class="flex gap-2">
                    <span class="text-gray-500 w-24">Exception:</span>
                    <pre class="text-red-300 flex-1 whitespace-pre-wrap text-xs bg-red-950/30 p-2 rounded">{log.exception}</pre>
                  </div>
                {/if}

                <div class="flex gap-2">
                  <span class="text-gray-500 w-24">Full Data:</span>
                  <pre class="text-gray-400 flex-1 whitespace-pre-wrap text-xs bg-gray-800 p-2 rounded">{JSON.stringify(log, null, 2)}</pre>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- Pagination -->
    <div class="flex items-center justify-between mt-6 pt-4 border-t border-gray-700">
      <div class="text-sm text-gray-400">
        Showing {offset + 1} to {Math.min(offset + limit, total)} of {total}
      </div>

      <div class="flex gap-2">
        <button
          on:click={prevPage}
          disabled={offset === 0}
          class="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>

        <button
          on:click={nextPage}
          disabled={offset + limit >= total}
          class="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .badge {
    @apply inline-block px-1.5 py-0.5 text-xs font-semibold rounded;
  }
</style>
