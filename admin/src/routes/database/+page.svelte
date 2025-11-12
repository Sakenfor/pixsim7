<script lang="ts">
  import { onMount } from 'svelte';
  import { ADMIN_API_BASE } from '$lib/config';

  type Tab = 'migrations' | 'schema' | 'query' | 'tables';
  let activeTab: Tab = 'migrations';
  let loading = false;
  let error: string | null = null;

  const API_BASE = ADMIN_API_BASE;

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

  // Migration status
  let migrationStatus: any = null;
  let migrationLoading = false;
  let migrationError: string | null = null;
  let successMessage: string | null = null;
  let operationOutput: string = '';
  let showOutput = false;

  async function loadMigrationStatus() {
    try {
      migrationLoading = true;
      migrationError = null;
      successMessage = null;
      migrationStatus = await fetchAPI('/admin/migrations/status');
    } catch (e: any) {
      migrationError = e.message;
      console.error('Failed to load migration status', e);
    } finally {
      migrationLoading = false;
    }
  }

  async function runUpgrade() {
    if (!confirm('Run database upgrade to latest version (head)?')) return;

    try {
      migrationLoading = true;
      migrationError = null;
      successMessage = null;
      showOutput = false;

      const result = await fetchAPI('/admin/migrations/upgrade', {
        method: 'POST'
      });

      successMessage = result.message;
      operationOutput = result.output;
      showOutput = true;

      await loadMigrationStatus();
    } catch (e: any) {
      migrationError = e.message;
    } finally {
      migrationLoading = false;
    }
  }

  async function runDowngrade() {
    if (!confirm('⚠️ CAUTION: Downgrade database by one revision?\n\nThis may cause data loss!')) return;

    try {
      migrationLoading = true;
      migrationError = null;
      successMessage = null;
      showOutput = false;

      const result = await fetchAPI('/admin/migrations/downgrade', {
        method: 'POST'
      });

      successMessage = result.message;
      operationOutput = result.output;
      showOutput = true;

      await loadMigrationStatus();
    } catch (e: any) {
      migrationError = e.message;
    } finally {
      migrationLoading = false;
    }
  }

  async function runStamp() {
    if (!confirm('Stamp database as up-to-date without running migrations?\n\nUse this only if your schema already matches the target revision.')) return;

    try {
      migrationLoading = true;
      migrationError = null;
      successMessage = null;
      showOutput = false;

      const result = await fetchAPI('/admin/migrations/stamp', {
        method: 'POST'
      });

      successMessage = result.message;
      operationOutput = result.output;
      showOutput = true;

      await loadMigrationStatus();
    } catch (e: any) {
      migrationError = e.message;
    } finally {
      migrationLoading = false;
    }
  }

  $: if (activeTab === 'migrations' && !migrationStatus) {
    loadMigrationStatus();
  }


  // Schema viewer
  let tables: string[] = [];
  let selectedTable: string | null = null;
  let tableSchema: any = null;
  let loadingSchema = false;
  let schemaError: string | null = null;

  async function loadTables() {
    try {
      loadingSchema = true;
      schemaError = null;
      const response = await fetchAPI('/admin/database/schema');
      tables = response.tables || [];

      if (tables.length > 0 && !selectedTable) {
        await loadTableSchema(tables[0]);
      }
    } catch (e: any) {
      schemaError = e.message;
      console.error('Failed to load tables', e);
    } finally {
      loadingSchema = false;
    }
  }

  async function loadTableSchema(tableName: string) {
    try {
      loadingSchema = true;
      schemaError = null;
      selectedTable = tableName;
      tableSchema = await fetchAPI(`/admin/database/schema/${tableName}`);
    } catch (e: any) {
      schemaError = e.message;
      console.error('Failed to load table schema', e);
    } finally {
      loadingSchema = false;
    }
  }

  $: if (activeTab === 'schema' && tables.length === 0) {
    loadTables();
  }

</script>

<div class="space-y-8">
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-4xl font-bold mb-2">Database</h1>
      <p class="text-gray-400">Database administration and management</p>
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex gap-2 border-b border-gray-700">
    <button
      class="px-4 py-2 {activeTab === 'migrations' ? 'border-b-2 border-blue-400 text-blue-400' : 'text-gray-400 hover:text-white'}"
      on:click={() => activeTab = 'migrations'}
    >
      📊 Status & Migrations
    </button>
    <button
      class="px-4 py-2 {activeTab === 'schema' ? 'border-b-2 border-blue-400 text-blue-400' : 'text-gray-400 hover:text-white'}"
      on:click={() => activeTab = 'schema'}
    >
      📋 Schema Viewer
    </button>
    <button
      class="px-4 py-2 {activeTab === 'tables' ? 'border-b-2 border-blue-400 text-blue-400' : 'text-gray-400 hover:text-white'}"
      on:click={() => activeTab = 'tables'}
    >
      🗂️ Table Browser
    </button>
    <button
      class="px-4 py-2 {activeTab === 'query' ? 'border-b-2 border-blue-400 text-blue-400' : 'text-gray-400 hover:text-white'}"
      on:click={() => activeTab = 'query'}
    >
      ⚡ SQL Query
    </button>
  </div>

  {#if error}
    <div class="bg-red-900/20 border border-red-500 rounded-lg p-4">
      <p class="text-red-400">{error}</p>
      <p class="text-sm text-gray-400 mt-2">Make sure backend endpoints are implemented</p>
    </div>
  {/if}

  <!-- Migrations Tab -->
  {#if activeTab === 'migrations'}
    <div class="space-y-6">
      <!-- Info Card for Beginners -->
      <div class="card bg-blue-900/10 border-blue-700">
        <h3 class="text-lg font-bold text-blue-400 mb-2">ℹ️ About Database Migrations</h3>
        <p class="text-sm text-gray-300 mb-3">
          Alembic manages your database schema changes over time. Each migration is a version-controlled
          change to your database structure (adding tables, columns, indexes, etc).
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <p class="text-blue-400 font-semibold mb-1">📚 Key Concepts:</p>
            <ul class="text-gray-300 space-y-1 ml-4">
              <li>• <strong>Revision:</strong> A unique ID for each migration</li>
              <li>• <strong>Head:</strong> The latest migration in your codebase</li>
              <li>• <strong>Current:</strong> The migration your DB is currently at</li>
            </ul>
          </div>
          <div>
            <p class="text-blue-400 font-semibold mb-1">🔄 Common Workflow:</p>
            <ul class="text-gray-300 space-y-1 ml-4">
              <li>1. Developer creates migration file</li>
              <li>2. Check status to see pending changes</li>
              <li>3. Run upgrade to apply changes</li>
              <li>4. Verify database is up-to-date</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Messages -->
      {#if migrationError}
        <div class="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p class="text-red-400 font-semibold">❌ Error</p>
          <p class="text-red-300 text-sm mt-1">{migrationError}</p>
          <details class="mt-3">
            <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-300">Troubleshooting tips</summary>
            <ul class="text-xs text-gray-400 mt-2 ml-4 space-y-1">
              <li>• Make sure the backend server is running (http://localhost:8000)</li>
              <li>• Check that Alembic is installed: <code class="bg-gray-800 px-1">pip install alembic</code></li>
              <li>• Verify alembic.ini exists in the project root</li>
              <li>• Check backend logs for detailed error messages</li>
            </ul>
          </details>
        </div>
      {/if}

      {#if successMessage}
        <div class="bg-green-900/20 border border-green-500 rounded-lg p-4">
          <p class="text-green-400 font-semibold">✅ Success</p>
          <p class="text-green-300 text-sm mt-1">{successMessage}</p>
        </div>
      {/if}

      <!-- Status Card -->
      {#if migrationLoading && !migrationStatus}
        <div class="card">
          <p class="text-gray-400">Loading migration status...</p>
        </div>
      {:else if migrationStatus}
        <div class="card">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold">Migration Status</h2>
            <button on:click={loadMigrationStatus} class="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded" disabled={migrationLoading}>
              {migrationLoading ? '⏳' : '🔄'} Refresh
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p class="text-sm text-gray-400 mb-1">Current Revision</p>
              <p class="text-lg font-mono text-blue-400">
                {migrationStatus.current_revision || 'None'}
              </p>
            </div>

            <div>
              <p class="text-sm text-gray-400 mb-1">Head Revision</p>
              <p class="text-lg font-mono text-purple-400">
                {migrationStatus.head_revision || 'Unknown'}
              </p>
            </div>

            <div>
              <p class="text-sm text-gray-400 mb-1">Status</p>
              {#if migrationStatus.is_up_to_date}
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

          {#if migrationStatus.pending_migrations && migrationStatus.pending_migrations.length > 0}
            <div class="mt-6 p-4 bg-yellow-900/10 border border-yellow-700 rounded">
              <p class="text-sm font-semibold text-yellow-400 mb-2">Pending Migrations:</p>
              <ul class="text-sm text-gray-300 space-y-1">
                {#each migrationStatus.pending_migrations as pending}
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
            disabled={migrationLoading || (migrationStatus && migrationStatus.is_up_to_date)}
          >
            ⬆️ Upgrade to Head
          </button>

          <button
            on:click={runDowngrade}
            class="btn btn-warning flex items-center justify-center gap-2"
            disabled={migrationLoading || !migrationStatus || !migrationStatus.current_revision}
          >
            ⬇️ Downgrade -1
          </button>

          <button
            on:click={runStamp}
            class="btn btn-secondary flex items-center justify-center gap-2"
            disabled={migrationLoading}
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
      {#if migrationStatus && migrationStatus.history && migrationStatus.history.length > 0}
        <div class="card">
          <h2 class="text-xl font-bold mb-4">📜 Migration History</h2>
          <p class="text-sm text-gray-400 mb-4">
            Shows the chronological list of database migrations. Most recent at the top.
          </p>
          <div class="bg-gray-900 p-4 rounded">
            <ul class="text-sm text-gray-300 space-y-2 font-mono">
              {#each migrationStatus.history as item, index}
                <li class="border-l-2 {index === 0 ? 'border-blue-500' : 'border-gray-700'} pl-3 py-1">
                  {#if index === 0}
                    <span class="text-blue-400">→</span>
                  {/if}
                  {item.line}
                </li>
              {/each}
            </ul>
          </div>
          <p class="text-xs text-gray-500 mt-3">
            💡 Tip: Run <code class="bg-gray-800 px-1">alembic history</code> in terminal to see full details
          </p>
        </div>
      {:else if migrationStatus && (!migrationStatus.history || migrationStatus.history.length === 0)}
        <div class="card bg-yellow-900/10 border-yellow-700">
          <h2 class="text-xl font-bold mb-2">📜 Migration History</h2>
          <p class="text-sm text-yellow-400">
            No migration history available. This might mean:
          </p>
          <ul class="text-sm text-gray-400 mt-2 ml-4 space-y-1">
            <li>• No migrations have been created yet</li>
            <li>• The database hasn't been initialized</li>
            <li>• Alembic hasn't been set up for this project</li>
          </ul>
          <p class="text-xs text-gray-500 mt-3">
            💡 To create your first migration: <code class="bg-gray-800 px-1">alembic revision -m "initial schema"</code>
          </p>
        </div>
      {/if}

      <!-- Quick Reference Card -->
      <div class="card bg-gray-800/50 border-gray-700">
        <h3 class="text-lg font-bold mb-3">🛠️ Command Reference</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-gray-400 font-semibold mb-2">Common Alembic Commands:</p>
            <div class="space-y-2 font-mono text-xs">
              <div class="bg-gray-900 p-2 rounded">
                <code class="text-green-400">alembic current</code>
                <p class="text-gray-500 mt-1">Show current revision</p>
              </div>
              <div class="bg-gray-900 p-2 rounded">
                <code class="text-green-400">alembic history</code>
                <p class="text-gray-500 mt-1">Show all migrations</p>
              </div>
              <div class="bg-gray-900 p-2 rounded">
                <code class="text-green-400">alembic upgrade head</code>
                <p class="text-gray-500 mt-1">Apply all pending migrations</p>
              </div>
            </div>
          </div>
          <div>
            <p class="text-gray-400 font-semibold mb-2">Creating Migrations:</p>
            <div class="space-y-2 font-mono text-xs">
              <div class="bg-gray-900 p-2 rounded">
                <code class="text-green-400">alembic revision -m "message"</code>
                <p class="text-gray-500 mt-1">Create new empty migration</p>
              </div>
              <div class="bg-gray-900 p-2 rounded">
                <code class="text-green-400">alembic revision --autogenerate -m "message"</code>
                <p class="text-gray-500 mt-1">Auto-detect schema changes</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Schema Viewer Tab -->
  {#if activeTab === 'schema'}
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- Table List -->
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold">Tables ({tables.length})</h3>
          <button
            on:click={loadTables}
            class="text-xs text-blue-400 hover:text-blue-300"
            disabled={loadingSchema}
          >
            {loadingSchema ? '...' : '↻'}
          </button>
        </div>

        {#if loadingSchema && tables.length === 0}
          <p class="text-sm text-gray-400">Loading...</p>
        {:else if schemaError && tables.length === 0}
          <div class="text-sm text-red-400">
            <p>Error: {schemaError}</p>
          </div>
        {:else if tables.length === 0}
          <p class="text-sm text-gray-400">No tables</p>
        {:else}
          <div class="space-y-1 max-h-[600px] overflow-y-auto">
            {#each tables as table}
              <button
                class="w-full text-left px-3 py-2 rounded text-sm {
                  selectedTable === table
                    ? 'bg-blue-900/30 text-blue-400 font-medium'
                    : 'hover:bg-gray-800 text-gray-300'
                }"
                on:click={() => loadTableSchema(table)}
              >
                <code>{table}</code>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Schema Details -->
      <div class="card lg:col-span-3">
        {#if loadingSchema && selectedTable}
          <p class="text-gray-400">Loading...</p>
        {:else if schemaError && selectedTable}
          <div class="bg-red-900/20 border border-red-500 rounded p-4">
            <p class="text-red-400">Error: {schemaError}</p>
          </div>
        {:else if tableSchema && selectedTable}
          <div class="mb-4">
            <h3 class="text-2xl font-bold">
              <code class="text-blue-400">{selectedTable}</code>
            </h3>
            <p class="text-sm text-gray-400 mt-1">
              {tableSchema.columns?.length || 0} columns
            </p>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-700">
                  <th class="text-left py-2 px-3 text-sm font-semibold text-gray-400">Column</th>
                  <th class="text-left py-2 px-3 text-sm font-semibold text-gray-400">Type</th>
                  <th class="text-center py-2 px-3 text-sm font-semibold text-gray-400">Nullable</th>
                  <th class="text-left py-2 px-3 text-sm font-semibold text-gray-400">Default</th>
                </tr>
              </thead>
              <tbody>
                {#if tableSchema.columns && tableSchema.columns.length > 0}
                  {#each tableSchema.columns as column}
                    <tr class="border-b border-gray-800 hover:bg-gray-800/50">
                      <td class="py-3 px-3">
                        <code class="text-green-400">{column.name}</code>
                      </td>
                      <td class="py-3 px-3">
                        <code class="text-sm text-cyan-400">{column.type}</code>
                      </td>
                      <td class="py-3 px-3 text-center">
                        {#if column.nullable}
                          <span class="text-gray-400">✓</span>
                        {:else}
                          <span class="text-red-400">✗</span>
                        {/if}
                      </td>
                      <td class="py-3 px-3">
                        {#if column.default}
                          <code class="text-sm text-gray-400">{column.default}</code>
                        {:else}
                          <span class="text-gray-600">—</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                {:else}
                  <tr>
                    <td colspan="4" class="py-4 text-center text-gray-500">No columns</td>
                  </tr>
                {/if}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="text-center py-12">
            <p class="text-gray-400">Select a table</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Other tabs -->
  {#if activeTab === 'tables' || activeTab === 'query'}
    <div class="card text-center py-12">
      <p class="text-gray-400 text-lg">Feature coming soon</p>
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
