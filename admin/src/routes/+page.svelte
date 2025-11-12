<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  let stats = {
    jobs: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 },
    assets: { total: 0, videos: 0, images: 0 },
    accounts: { total: 0, active: 0, exhausted: 0 },
    health: { status: '', database: '', redis: '' }
  };

  let recentJobs: any[] = [];
  let recentAssets: any[] = [];
  let loading = true;
  let error: string | null = null;

  async function loadDashboard() {
    try {
      loading = true;
      error = null;

      // Load everything in parallel
      const [health, jobs, assets, accounts] = await Promise.all([
        api.getHealth().catch(() => ({ status: 'unknown', database: 'unknown', redis: 'unknown' })),
        api.getJobs({ limit: 100 }).catch(() => []),
        api.getAssets({ limit: 50 }).catch(() => []),
        api.getAccounts().catch(() => [])
      ]);

      // Calculate job stats
      stats.jobs.total = jobs.length;
      stats.jobs.pending = jobs.filter((j: any) => j.status === 'pending').length;
      stats.jobs.processing = jobs.filter((j: any) => j.status === 'processing').length;
      stats.jobs.completed = jobs.filter((j: any) => j.status === 'completed').length;
      stats.jobs.failed = jobs.filter((j: any) => j.status === 'failed').length;

      // Calculate asset stats
      stats.assets.total = assets.length;
      stats.assets.videos = assets.filter((a: any) => a.media_type === 'video').length;
      stats.assets.images = assets.filter((a: any) => a.media_type === 'image').length;

      // Calculate account stats
      stats.accounts.total = accounts.length;
      stats.accounts.active = accounts.filter((a: any) => a.status === 'active').length;
      stats.accounts.exhausted = accounts.filter((a: any) => a.status === 'exhausted').length;

      // System health
      stats.health = health;

      // Recent items
      recentJobs = jobs.slice(0, 5);
      recentAssets = assets.slice(0, 8);

    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load dashboard';
    } finally {
      loading = false;
    }
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-500',
      processing: 'bg-blue-500',
      completed: 'bg-green-500',
      failed: 'bg-red-500',
      active: 'bg-green-500',
      exhausted: 'bg-yellow-500',
      healthy: 'bg-green-500',
      connected: 'bg-green-500',
    };
    return colors[status?.toLowerCase()] || 'bg-gray-500';
  }

  function formatTime(dateString: string | null): string {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return 'Just now';
    } catch {
      return 'N/A';
    }
  }

  onMount(() => {
    loadDashboard();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  });
</script>

<div class="space-y-8">
  <!-- Header -->
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-4xl font-bold mb-2">Dashboard</h1>
      <p class="text-gray-400">PixSim7 system overview</p>
    </div>
    <button on:click={loadDashboard} class="btn btn-primary">
      Refresh
    </button>
  </div>

  {#if error}
    <div class="bg-red-900/20 border border-red-500 rounded-lg p-4">
      <p class="text-red-400">{error}</p>
    </div>
  {/if}

  {#if loading}
    <p class="text-gray-400">Loading dashboard...</p>
  {:else}
    <!-- System Health -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="card">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold">System</h3>
          <div class="w-3 h-3 rounded-full {getStatusColor(stats.health.status)}"></div>
        </div>
        <p class="text-3xl font-bold text-green-400 capitalize">{stats.health.status || 'Unknown'}</p>
      </div>

      <div class="card">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold">Database</h3>
          <div class="w-3 h-3 rounded-full {getStatusColor(stats.health.database)}"></div>
        </div>
        <p class="text-3xl font-bold text-green-400 capitalize">{stats.health.database || 'Unknown'}</p>
      </div>

      <div class="card">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold">Redis</h3>
          <div class="w-3 h-3 rounded-full {getStatusColor(stats.health.redis)}"></div>
        </div>
        <p class="text-3xl font-bold text-green-400 capitalize">{stats.health.redis || 'Unknown'}</p>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
      <!-- Job Stats -->
      <div class="card text-center">
        <p class="text-4xl font-bold text-blue-400">{stats.jobs.total}</p>
        <p class="text-sm text-gray-400 mt-1">Total Jobs</p>
      </div>

      <div class="card text-center">
        <p class="text-4xl font-bold text-yellow-400">{stats.jobs.pending}</p>
        <p class="text-sm text-gray-400 mt-1">Pending</p>
      </div>

      <div class="card text-center">
        <p class="text-4xl font-bold text-blue-400">{stats.jobs.processing}</p>
        <p class="text-sm text-gray-400 mt-1">Processing</p>
      </div>

      <div class="card text-center">
        <p class="text-4xl font-bold text-green-400">{stats.jobs.completed}</p>
        <p class="text-sm text-gray-400 mt-1">Completed</p>
      </div>

      <div class="card text-center">
        <p class="text-4xl font-bold text-red-400">{stats.jobs.failed}</p>
        <p class="text-sm text-gray-400 mt-1">Failed</p>
      </div>

      <!-- Asset Stats -->
      <div class="card text-center">
        <p class="text-4xl font-bold text-purple-400">{stats.assets.total}</p>
        <p class="text-sm text-gray-400 mt-1">Total Assets</p>
      </div>

      <div class="card text-center">
        <p class="text-4xl font-bold text-green-400">{stats.assets.videos}</p>
        <p class="text-sm text-gray-400 mt-1">Videos</p>
      </div>

      <div class="card text-center">
        <p class="text-4xl font-bold text-blue-400">{stats.assets.images}</p>
        <p class="text-sm text-gray-400 mt-1">Images</p>
      </div>

      <!-- Account Stats -->
      <div class="card text-center">
        <p class="text-4xl font-bold text-cyan-400">{stats.accounts.total}</p>
        <p class="text-sm text-gray-400 mt-1">Total Accounts</p>
      </div>

      <div class="card text-center">
        <p class="text-4xl font-bold text-green-400">{stats.accounts.active}</p>
        <p class="text-sm text-gray-400 mt-1">Active</p>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Recent Jobs -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">Recent Jobs</h2>
          <a href="/jobs" class="text-sm text-blue-400 hover:underline">View all →</a>
        </div>

        {#if recentJobs.length === 0}
          <p class="text-gray-400 text-center py-8">No jobs yet</p>
        {:else}
          <div class="space-y-3">
            {#each recentJobs as job}
              <div class="p-3 bg-gray-800 rounded-lg">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm font-semibold">Job #{job.id}</span>
                  <span class="px-2 py-1 text-xs rounded {
                    job.status === 'completed' ? 'bg-green-900/30 text-green-400' :
                    job.status === 'processing' ? 'bg-blue-900/30 text-blue-400' :
                    job.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400' :
                    'bg-red-900/30 text-red-400'
                  }">
                    {job.status}
                  </span>
                </div>
                <p class="text-xs text-gray-400 capitalize">{job.operation_type} · {job.provider_id}</p>
                <p class="text-xs text-gray-500 mt-1">{formatTime(job.created_at)}</p>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Recent Assets -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">Recent Assets</h2>
          <a href="/assets" class="text-sm text-blue-400 hover:underline">View all →</a>
        </div>

        {#if recentAssets.length === 0}
          <p class="text-gray-400 text-center py-8">No assets yet</p>
        {:else}
          <div class="grid grid-cols-4 gap-2">
            {#each recentAssets as asset}
              <div class="aspect-video bg-gray-800 rounded overflow-hidden relative group">
                {#if asset.thumbnail_url}
                  <img src={asset.thumbnail_url} alt="Asset" class="w-full h-full object-cover" />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-2xl">
                    {asset.media_type === 'video' ? '🎥' : '🖼️'}
                  </div>
                {/if}
                <div class="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <span class="text-xs text-white">#{asset.id}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Quick Links -->
    <div class="card">
      <h2 class="text-xl font-bold mb-4">Quick Links</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <a href="/accounts" class="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-center">
          <span class="text-3xl block mb-2">👤</span>
          <p class="font-semibold">Manage Accounts</p>
          <p class="text-xs text-gray-400 mt-1">{stats.accounts.total} accounts</p>
        </a>

        <a href="/jobs" class="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-center">
          <span class="text-3xl block mb-2">⚙️</span>
          <p class="font-semibold">Monitor Jobs</p>
          <p class="text-xs text-gray-400 mt-1">{stats.jobs.processing} processing</p>
        </a>

        <a href="/assets" class="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-center">
          <span class="text-3xl block mb-2">🎬</span>
          <p class="font-semibold">Browse Assets</p>
          <p class="text-xs text-gray-400 mt-1">{stats.assets.total} assets</p>
        </a>

        <a href="/services" class="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-center">
          <span class="text-3xl block mb-2">🔧</span>
          <p class="font-semibold">System Health</p>
          <p class="text-xs text-gray-400 mt-1 capitalize">{stats.health.status}</p>
        </a>
      </div>
    </div>
  {/if}
</div>
