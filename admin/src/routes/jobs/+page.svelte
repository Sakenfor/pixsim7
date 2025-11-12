<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { formatDistanceToNow } from 'date-fns';

  let jobs: any[] = [];
  let loading = true;
  let error: string | null = null;
  let selectedStatus = 'all';
  let selectedProvider = 'all';
  let autoRefresh = true;
  let refreshInterval: any;

  async function loadJobs() {
    try {
      loading = true;
      error = null;
      const params: any = {};
      if (selectedStatus !== 'all') params.status = selectedStatus;
      if (selectedProvider !== 'all') params.provider_id = selectedProvider;
      params.limit = 50;

      jobs = await api.getJobs(params);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load jobs';
    } finally {
      loading = false;
    }
  }

  async function handleCancel(job_id: number) {
    if (!confirm('Are you sure you want to cancel this job?')) return;
    try {
      await api.cancelJob(job_id);
      await loadJobs();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to cancel job';
    }
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      pending: 'text-yellow-400 bg-yellow-900/30',
      processing: 'text-blue-400 bg-blue-900/30',
      completed: 'text-green-400 bg-green-900/30',
      failed: 'text-red-400 bg-red-900/30',
      cancelled: 'text-gray-400 bg-gray-900/30',
    };
    return colors[status.toLowerCase()] || 'text-gray-400 bg-gray-900/30';
  }

  function formatTime(dateString: string | null): string {
    if (!dateString) return 'N/A';
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Invalid date';
    }
  }

  function getDuration(start: string | null, end: string | null): string {
    if (!start) return 'N/A';
    if (!end) return 'In progress';
    try {
      const startTime = new Date(start).getTime();
      const endTime = new Date(end).getTime();
      const seconds = Math.floor((endTime - startTime) / 1000);
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ${minutes % 60}m`;
    } catch {
      return 'N/A';
    }
  }

  function getOperationTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      text_to_video: 'Text → Video',
      image_to_video: 'Image → Video',
      video_extend: 'Video Extend',
      video_transition: 'Transition',
      video_fusion: 'Fusion',
    };
    return labels[type] || type;
  }

  onMount(() => {
    loadJobs();

    if (autoRefresh) {
      refreshInterval = setInterval(loadJobs, 10000);
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  });

  $: {
    if (autoRefresh && !refreshInterval) {
      refreshInterval = setInterval(loadJobs, 10000);
    } else if (!autoRefresh && refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  $: selectedStatus, selectedProvider, loadJobs();
</script>

<div class="space-y-8">
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-4xl font-bold mb-2">Job Queue</h1>
      <p class="text-gray-400">Monitor video generation jobs</p>
    </div>
    <div class="flex items-center gap-2">
      <label class="flex items-center gap-2 text-sm text-gray-400">
        <input type="checkbox" bind:checked={autoRefresh} />
        Auto-refresh
      </label>
      <button on:click={loadJobs} class="btn btn-primary">
        Refresh
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex gap-4">
    <select
      bind:value={selectedStatus}
      class="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
    >
      <option value="all">All Statuses</option>
      <option value="pending">Pending</option>
      <option value="processing">Processing</option>
      <option value="completed">Completed</option>
      <option value="failed">Failed</option>
      <option value="cancelled">Cancelled</option>
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

  {#if loading && jobs.length === 0}
    <p class="text-gray-400">Loading jobs...</p>
  {:else if jobs.length === 0}
    <div class="card text-center py-12">
      <p class="text-gray-400 text-lg">No jobs found</p>
      <p class="text-gray-500 mt-2">Jobs will appear here when created</p>
    </div>
  {:else}
    <div class="space-y-4">
      {#each jobs as job}
        <div class="card">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <span class="px-3 py-1 rounded-full text-sm font-medium {getStatusColor(job.status)}">
                  {job.status}
                </span>
                <span class="text-gray-400">#{job.id}</span>
                <span class="text-gray-400 capitalize">{job.provider_id}</span>
                <span class="text-gray-500">•</span>
                <span class="text-gray-400">{getOperationTypeLabel(job.operation_type)}</span>
                {#if job.priority && job.priority !== 5}
                  <span class="px-2 py-1 text-xs bg-purple-900/30 text-purple-400 rounded">
                    Priority: {job.priority}
                  </span>
                {/if}
              </div>

              {#if job.name}
                <h3 class="text-lg font-semibold mb-2">{job.name}</h3>
              {/if}

              {#if job.params?.prompt}
                <p class="text-gray-300 mb-3 line-clamp-2">{job.params.prompt}</p>
              {/if}

              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span class="text-gray-500">Created</span>
                  <p class="text-gray-300">{formatTime(job.created_at)}</p>
                </div>
                {#if job.started_at}
                  <div>
                    <span class="text-gray-500">Started</span>
                    <p class="text-gray-300">{formatTime(job.started_at)}</p>
                  </div>
                {/if}
                {#if job.completed_at}
                  <div>
                    <span class="text-gray-500">Completed</span>
                    <p class="text-gray-300">{formatTime(job.completed_at)}</p>
                  </div>
                {/if}
                <div>
                  <span class="text-gray-500">Duration</span>
                  <p class="text-gray-300">{getDuration(job.started_at, job.completed_at)}</p>
                </div>
              </div>

              {#if job.error_message}
                <div class="mt-3 p-3 bg-red-900/20 border border-red-500/50 rounded text-sm">
                  <span class="text-red-400">{job.error_message}</span>
                </div>
              {/if}
            </div>

            <div class="flex flex-col gap-2 ml-4">
              {#if job.status === 'pending' || job.status === 'processing'}
                <button
                  on:click={() => handleCancel(job.id)}
                  class="px-4 py-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition text-sm"
                >
                  Cancel
                </button>
              {/if}
              {#if job.asset_id}
                <a
                  href="/assets?asset_id={job.asset_id}"
                  class="px-4 py-2 bg-blue-900/30 text-blue-400 rounded-lg hover:bg-blue-900/50 transition text-sm text-center"
                >
                  View Asset
                </a>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Stats Summary -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
      {#each ['pending', 'processing', 'completed', 'failed', 'cancelled'] as status}
        {@const count = jobs.filter(j => j.status === status).length}
        <div class="card text-center">
          <p class="text-3xl font-bold {getStatusColor(status).split(' ')[0]}">{count}</p>
          <p class="text-sm text-gray-400 capitalize mt-1">{status}</p>
        </div>
      {/each}
    </div>
  {/if}
</div>
