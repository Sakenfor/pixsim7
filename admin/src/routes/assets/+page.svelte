<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { formatDistanceToNow } from 'date-fns';

  let assets: any[] = [];
  let loading = true;
  let error: string | null = null;
  let selectedMediaType = 'all';
  let selectedProvider = 'all';
  let selectedAsset: any = null;
  let showDetailsModal = false;

  async function loadAssets() {
    try {
      loading = true;
      error = null;
      const params: any = { limit: 50 };
      if (selectedMediaType !== 'all') params.media_type = selectedMediaType;
      if (selectedProvider !== 'all') params.provider_id = selectedProvider;

      assets = await api.getAssets(params);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load assets';
    } finally {
      loading = false;
    }
  }

  async function handleDelete(asset_id: number) {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    try {
      await api.deleteAsset(asset_id);
      await loadAssets();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete asset';
    }
  }

  function showDetails(asset: any) {
    selectedAsset = asset;
    showDetailsModal = true;
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatTime(dateString: string | null): string {
    if (!dateString) return 'N/A';
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Invalid date';
    }
  }

  function getSyncStatusColor(status: string): string {
    const colors: Record<string, string> = {
      remote_only: 'bg-blue-500',
      downloading: 'bg-yellow-500',
      downloaded: 'bg-green-500',
      failed: 'bg-red-500',
    };
    return colors[status.toLowerCase()] || 'bg-gray-500';
  }

  onMount(() => {
    loadAssets();
  });

  $: selectedMediaType, selectedProvider, loadAssets();
</script>

<div class="space-y-8">
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-4xl font-bold mb-2">Assets</h1>
      <p class="text-gray-400">Browse generated videos and images</p>
    </div>
    <button on:click={loadAssets} class="btn btn-primary">
      Refresh
    </button>
  </div>

  <!-- Filters -->
  <div class="flex gap-4">
    <select
      bind:value={selectedMediaType}
      class="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
    >
      <option value="all">All Types</option>
      <option value="video">Videos</option>
      <option value="image">Images</option>
      <option value="audio">Audio</option>
    </select>

    <select
      bind:value={selectedProvider}
      class="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
    >
      <option value="all">All Providers</option>
      <option value="pixverse">Pixverse</option>
      <option value="sora">Sora</option>
      <option value="runway">Runway</option>
    </select>
  </div>

  {#if error}
    <div class="bg-red-900/20 border border-red-500 rounded-lg p-4">
      <p class="text-red-400">{error}</p>
    </div>
  {/if}

  {#if loading && assets.length === 0}
    <p class="text-gray-400">Loading assets...</p>
  {:else if assets.length === 0}
    <div class="card text-center py-12">
      <p class="text-gray-400 text-lg">No assets found</p>
      <p class="text-gray-500 mt-2">Assets will appear here after jobs complete</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {#each assets as asset}
        <div class="card overflow-hidden">
          <!-- Thumbnail -->
          <div class="relative aspect-video bg-gray-800 mb-4">
            {#if asset.thumbnail_url}
              <img
                src={asset.thumbnail_url}
                alt="Asset thumbnail"
                class="w-full h-full object-cover"
                loading="lazy"
              />
            {:else}
              <div class="w-full h-full flex items-center justify-center">
                <span class="text-4xl text-gray-600">
                  {#if asset.media_type === 'video'}🎥{:else if asset.media_type === 'image'}🖼️{:else}📄{/if}
                </span>
              </div>
            {/if}
            <div class="absolute top-2 right-2 px-2 py-1 text-xs bg-black/70 text-white rounded">
              {asset.media_type}
            </div>
            <div class="absolute bottom-2 right-2">
              <div class="w-2 h-2 rounded-full {getSyncStatusColor(asset.sync_status)}"></div>
            </div>
          </div>

          <!-- Info -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-500">ID</span>
              <span class="text-gray-300 font-mono">#{asset.id}</span>
            </div>

            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-500">Provider</span>
              <span class="text-gray-300 capitalize">{asset.provider_id}</span>
            </div>

            {#if asset.width && asset.height}
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-500">Resolution</span>
                <span class="text-gray-300">{asset.width}x{asset.height}</span>
              </div>
            {/if}

            {#if asset.duration_sec}
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-500">Duration</span>
                <span class="text-gray-300">{formatDuration(asset.duration_sec)}</span>
              </div>
            {/if}

            {#if asset.file_size_bytes}
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-500">Size</span>
                <span class="text-gray-300">{formatFileSize(asset.file_size_bytes)}</span>
              </div>
            {/if}

            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-500">Created</span>
              <span class="text-gray-300">{formatTime(asset.created_at)}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-2 mt-4">
            <button
              on:click={() => showDetails(asset)}
              class="flex-1 px-3 py-2 bg-blue-900/30 text-blue-400 rounded-lg hover:bg-blue-900/50 transition text-sm"
            >
              Details
            </button>
            {#if asset.remote_url}
              <a
                href={asset.remote_url}
                target="_blank"
                rel="noopener noreferrer"
                class="flex-1 px-3 py-2 bg-green-900/30 text-green-400 rounded-lg hover:bg-green-900/50 transition text-sm text-center"
              >
                View
              </a>
            {/if}
            <button
              on:click={() => handleDelete(asset.id)}
              class="px-3 py-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition text-sm"
            >
              🗑️
            </button>
          </div>
        </div>
      {/each}
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
      <div class="card text-center">
        <p class="text-3xl font-bold text-blue-400">{assets.length}</p>
        <p class="text-sm text-gray-400 mt-1">Total Assets</p>
      </div>
      <div class="card text-center">
        <p class="text-3xl font-bold text-green-400">
          {assets.filter(a => a.media_type === 'video').length}
        </p>
        <p class="text-sm text-gray-400 mt-1">Videos</p>
      </div>
      <div class="card text-center">
        <p class="text-3xl font-bold text-purple-400">
          {assets.filter(a => a.media_type === 'image').length}
        </p>
        <p class="text-sm text-gray-400 mt-1">Images</p>
      </div>
      <div class="card text-center">
        <p class="text-3xl font-bold text-yellow-400">
          {formatFileSize(assets.reduce((sum, a) => sum + (a.file_size_bytes || 0), 0))}
        </p>
        <p class="text-sm text-gray-400 mt-1">Total Size</p>
      </div>
    </div>
  {/if}
</div>

<!-- Details Modal -->
{#if showDetailsModal && selectedAsset}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click={() => (showDetailsModal = false)}>
    <div class="card max-w-2xl w-full max-h-[90vh] overflow-y-auto" on:click|stopPropagation>
      <h2 class="text-2xl font-bold mb-6">Asset Details</h2>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-gray-500">ID</span>
            <p class="text-gray-300 font-mono">#{selectedAsset.id}</p>
          </div>
          <div>
            <span class="text-gray-500">Provider</span>
            <p class="text-gray-300 capitalize">{selectedAsset.provider_id}</p>
          </div>
          <div>
            <span class="text-gray-500">Media Type</span>
            <p class="text-gray-300 capitalize">{selectedAsset.media_type}</p>
          </div>
          <div>
            <span class="text-gray-500">Sync Status</span>
            <p class="text-gray-300 capitalize">{selectedAsset.sync_status}</p>
          </div>
          {#if selectedAsset.width && selectedAsset.height}
            <div>
              <span class="text-gray-500">Resolution</span>
              <p class="text-gray-300">{selectedAsset.width}x{selectedAsset.height}</p>
            </div>
          {/if}
          {#if selectedAsset.duration_sec}
            <div>
              <span class="text-gray-500">Duration</span>
              <p class="text-gray-300">{formatDuration(selectedAsset.duration_sec)}</p>
            </div>
          {/if}
          {#if selectedAsset.file_size_bytes}
            <div>
              <span class="text-gray-500">File Size</span>
              <p class="text-gray-300">{formatFileSize(selectedAsset.file_size_bytes)}</p>
            </div>
          {/if}
          {#if selectedAsset.sha256}
            <div class="col-span-2">
              <span class="text-gray-500">SHA256</span>
              <p class="text-gray-300 font-mono text-xs break-all">{selectedAsset.sha256}</p>
            </div>
          {/if}
        </div>

        {#if selectedAsset.remote_url}
          <div>
            <span class="text-gray-500 text-sm">Remote URL</span>
            <a
              href={selectedAsset.remote_url}
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-400 hover:underline text-sm break-all block"
            >
              {selectedAsset.remote_url}
            </a>
          </div>
        {/if}

        {#if selectedAsset.local_path}
          <div>
            <span class="text-gray-500 text-sm">Local Path</span>
            <p class="text-gray-300 text-sm font-mono break-all">{selectedAsset.local_path}</p>
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-gray-500">Created</span>
            <p class="text-gray-300">{formatTime(selectedAsset.created_at)}</p>
          </div>
          {#if selectedAsset.downloaded_at}
            <div>
              <span class="text-gray-500">Downloaded</span>
              <p class="text-gray-300">{formatTime(selectedAsset.downloaded_at)}</p>
            </div>
          {/if}
        </div>
      </div>

      <button on:click={() => (showDetailsModal = false)} class="btn btn-primary w-full mt-6">
        Close
      </button>
    </div>
  </div>
{/if}
