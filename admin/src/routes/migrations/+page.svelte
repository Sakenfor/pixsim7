<script lang="ts">
  import { onMount } from 'svelte';
  import { ADMIN_API_BASE } from '$lib/config';

  const API_BASE = ADMIN_API_BASE;

  let loading = false;
  let error: string | null = null;
  let successMessage: string | null = null;
  
  // Migration status
  let status: any = null;
  let operationOutput: string = '';
  let showOutput = false;

  async function fetchAPI(endpoint: string, options: any = {}) {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `API error: ${response.statusText}`);
    }
    return response.json();
  }

  async function loadStatus() {
    try {
      loading = true;
      error = null;
      successMessage = null;
      status = await fetchAPI('/admin/migrations/status');
    } catch (e: any) {
      error = e.message;
      console.error('Failed to load migration status', e);
    } finally {
      loading = false;
    }
  }

  async function runUpgrade() {
    if (!confirm('Run database upgrade to latest version (head)?')) return;
    
    try {
      loading = true;
      error = null;
      successMessage = null;
      showOutput = false;
      
      const result = await fetchAPI('/admin/migrations/upgrade', {
        method: 'POST'
      });
      
      successMessage = result.message;
      operationOutput = result.output;
      showOutput = true;
      
      // Refresh status
      await loadStatus();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function runDowngrade() {
    if (!confirm('⚠️ CAUTION: Downgrade database by one revision?\n\nThis may cause data loss!')) return;
    
    try {
      loading = true;
      error = null;
      successMessage = null;
      showOutput = false;
      
      const result = await fetchAPI('/admin/migrations/downgrade', {
        method: 'POST'
      });
      
      successMessage = result.message;
      operationOutput = result.output;
      showOutput = true;
      
      // Refresh status
      await loadStatus();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function runStamp() {
    if (!confirm('Stamp database as up-to-date without running migrations?\n\nUse this only if your schema already matches the target revision.')) return;
    
    try {
      loading = true;
      error = null;
      successMessage = null;
      showOutput = false;
      
      const result = await fetchAPI('/admin/migrations/stamp', {
        method: 'POST'
      });
      
      successMessage = result.message;
      operationOutput = result.output;
      showOutput = true;
      
      // Refresh status
      await loadStatus();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadStatus();
  });
</script>

<div class="space-y-8">
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-4xl font-bold mb-2">Database Migrations</h1>
      <p class="text-gray-400">Manage Alembic schema migrations</p>
    </div>
    <button on:click={loadStatus} class="btn btn-primary" disabled={loading}>
      {loading ? '⏳' : '🔄'} Refresh
    </button>
  </div>

  <!-- Messages -->
  {#if error}
    <div class="bg-red-900/20 border border-red-500 rounded-lg p-4">
      <p class="text-red-400 font-semibold">❌ Error</p>
      <p class="text-red-300 text-sm mt-1">{error}</p>
    </div>
  {/if}

  {#if successMessage}
    <div class="bg-green-900/20 border border-green-500 rounded-lg p-4">
      <p class="text-green-400 font-semibold">✅ Success</p>
      <p class="text-green-300 text-sm mt-1">{successMessage}</p>
    </div>
  {/if}

  <!-- Status Card -->
  {#if status}
    <div class="card">
      <h2 class="text-xl font-bold mb-4">Current Status</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <p class="text-sm text-gray-400 mb-1">Current Revision</p>
          <p class="text-lg font-mono text-blue-400">
            {status.current_revision || 'None'}
          </p>
        </div>
        
        <div>
          <p class="text-sm text-gray-400 mb-1">Head Revision</p>
          <p class="text-lg font-mono text-purple-400">
            {status.head_revision || 'Unknown'}
          </p>
        </div>
        
        <div>
          <p class="text-sm text-gray-400 mb-1">Status</p>
          {#if status.is_up_to_date}
            <span class="inline-flex items-center gap-2 px-3 py-1 bg-green-900/30 border border-green-500 rounded text-green-400 text-sm font-semibold">
              ✅ Up to date
            </span>
          {:else}
            <span class="inline-flex items-center gap-2 px-3 py-1 bg-yellow-900/30 border border-yellow-500 rounded text-yellow-400 text-sm font-semibold">
              ⚠️ Pending migrations
            </span>
          {/if}
        </div>
      </div>

      {#if status.pending_migrations && status.pending_migrations.length > 0}
        <div class="mt-6 p-4 bg-yellow-900/10 border border-yellow-700 rounded">
          <p class="text-sm font-semibold text-yellow-400 mb-2">Pending Migrations:</p>
          <ul class="text-sm text-gray-300 space-y-1">
            {#each status.pending_migrations as pending}
              <li>• {pending}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Actions Card -->
  <div class="card">
    <h2 class="text-xl font-bold mb-4">Migration Actions</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <button 
        on:click={runUpgrade} 
        class="btn btn-success flex items-center justify-center gap-2"
        disabled={loading || (status && status.is_up_to_date)}
      >
        ⬆️ Upgrade to Head
      </button>
      
      <button 
        on:click={runDowngrade} 
        class="btn btn-warning flex items-center justify-center gap-2"
        disabled={loading || !status || !status.current_revision}
      >
        ⬇️ Downgrade -1
      </button>
      
      <button 
        on:click={runStamp} 
        class="btn btn-secondary flex items-center justify-center gap-2"
        disabled={loading}
      >
        🏷️ Stamp as Head
      </button>
    </div>

    <div class="mt-4 text-sm text-gray-400 space-y-1">
      <p>• <strong>Upgrade:</strong> Apply pending migrations to reach the latest schema version</p>
      <p>• <strong>Downgrade:</strong> Revert the last migration (⚠️ may cause data loss)</p>
      <p>• <strong>Stamp:</strong> Mark database as current version without running migrations</p>
    </div>
  </div>

  <!-- Output Display -->
  {#if showOutput && operationOutput}
    <div class="card">
      <h2 class="text-xl font-bold mb-4">Operation Output</h2>
      <pre class="bg-gray-900 p-4 rounded text-sm text-gray-300 overflow-x-auto font-mono">{operationOutput}</pre>
    </div>
  {/if}

  <!-- History Card -->
  {#if status && status.history && status.history.length > 0}
    <div class="card">
      <h2 class="text-xl font-bold mb-4">Recent Migration History</h2>
      <div class="bg-gray-900 p-4 rounded">
        <ul class="text-sm text-gray-300 space-y-2 font-mono">
          {#each status.history as item}
            <li class="border-l-2 border-gray-700 pl-3">{item.line}</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
</div>

<style>
  .card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 0.5rem;
    padding: 1.5rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 600;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn-success {
    background: #10b981;
    color: white;
  }

  .btn-success:hover:not(:disabled) {
    background: #059669;
  }

  .btn-warning {
    background: #f59e0b;
    color: white;
  }

  .btn-warning:hover:not(:disabled) {
    background: #d97706;
  }

  .btn-secondary {
    background: #6366f1;
    color: white;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #4f46e5;
  }
</style>
