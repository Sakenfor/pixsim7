<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  let accounts: any[] = [];
  let loading = true;
  let error: string | null = null;
  let selectedProvider = 'all';
  let showCreateModal = false;
  let showCreditModal = false;
  let selectedAccount: any = null;

  // Create form
  let createForm = {
    email: '',
    provider_id: 'pixverse',
    jwt_token: '',
    api_key_paid: '',
    is_private: false,
  };

  // Credit form
  let creditForm = {
    credit_type: 'webapi',
    amount: 0,
  };

  async function loadAccounts() {
    try {
      loading = true;
      error = null;
      const provider = selectedProvider === 'all' ? undefined : selectedProvider;
      accounts = await api.getAccounts(provider);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load accounts';
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    try {
      await api.createAccount(createForm);
      showCreateModal = false;
      resetCreateForm();
      await loadAccounts();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create account';
    }
  }

  async function handleSetCredit() {
    if (!selectedAccount) return;
    try {
      await api.setCredit(selectedAccount.id, creditForm.credit_type, creditForm.amount);
      showCreditModal = false;
      await loadAccounts();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to set credits';
    }
  }

  async function handleDelete(account_id: number) {
    if (!confirm('Are you sure you want to delete this account?')) return;
    try {
      await api.deleteAccount(account_id);
      await loadAccounts();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete account';
    }
  }

  function resetCreateForm() {
    createForm = {
      email: '',
      provider_id: 'pixverse',
      jwt_token: '',
      api_key_paid: '',
      is_private: false,
    };
  }

  function openCreditModal(account: any) {
    selectedAccount = account;
    creditForm = {
      credit_type: 'webapi',
      amount: 0,
    };
    showCreditModal = true;
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      active: 'bg-green-500',
      exhausted: 'bg-yellow-500',
      error: 'bg-red-500',
      inactive: 'bg-gray-500',
    };
    return colors[status.toLowerCase()] || 'bg-gray-500';
  }

  function formatCredits(credits: Record<string, number>): string {
    return Object.entries(credits)
      .map(([type, amount]) => `${type}: ${amount}`)
      .join(', ') || 'No credits';
  }

  onMount(() => {
    loadAccounts();
  });

  $: selectedProvider, loadAccounts();
</script>

<div class="space-y-8">
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-4xl font-bold mb-2">Provider Accounts</h1>
      <p class="text-gray-400">Manage provider accounts and credits</p>
    </div>
    <button on:click={() => (showCreateModal = true)} class="btn btn-primary">
      + Add Account
    </button>
  </div>

  <!-- Filters -->
  <div class="flex gap-4">
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

  {#if loading}
    <p class="text-gray-400">Loading accounts...</p>
  {:else if accounts.length === 0}
    <div class="card text-center py-12">
      <p class="text-gray-400 text-lg">No accounts found</p>
      <p class="text-gray-500 mt-2">Create an account to get started</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {#each accounts as account}
        <div class="card">
          <div class="flex items-start justify-between mb-4">
            <div>
              <h3 class="text-xl font-semibold">{account.email}</h3>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-sm text-gray-400 capitalize">{account.provider_id}</span>
                <span class="w-2 h-2 rounded-full {getStatusColor(account.status)}"></span>
                <span class="text-sm text-gray-400 capitalize">{account.status}</span>
              </div>
            </div>
            {#if account.is_private}
              <span class="px-2 py-1 text-xs bg-purple-900/30 text-purple-400 rounded">
                Private
              </span>
            {/if}
          </div>

          <div class="space-y-2 mb-4">
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Credits:</span>
              <span class="text-gray-300 font-mono">{formatCredits(account.credits)}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Total:</span>
              <span class="text-gray-300 font-mono">{account.total_credits}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Videos Generated:</span>
              <span class="text-gray-300">{account.total_videos_generated}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Success Rate:</span>
              <span class="text-gray-300">{(account.success_rate * 100).toFixed(1)}%</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Concurrent Jobs:</span>
              <span class="text-gray-300">
                {account.current_processing_jobs} / {account.max_concurrent_jobs}
              </span>
            </div>
          </div>

          <div class="flex gap-2">
            <button
              on:click={() => openCreditModal(account)}
              class="flex-1 px-4 py-2 bg-blue-900/30 text-blue-400 rounded-lg hover:bg-blue-900/50 transition"
            >
              Set Credits
            </button>
            <button
              on:click={() => handleDelete(account.id)}
              class="px-4 py-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition"
            >
              Delete
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Account Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" on:click={() => (showCreateModal = false)}>
    <div class="card max-w-lg w-full" on:click|stopPropagation>
      <h2 class="text-2xl font-bold mb-6">Add Provider Account</h2>

      <form on:submit|preventDefault={handleCreate} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Email</label>
          <input
            type="email"
            bind:value={createForm.email}
            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            required
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Provider</label>
          <select
            bind:value={createForm.provider_id}
            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="pixverse">Pixverse</option>
            <option value="sora">Sora</option>
            <option value="runway">Runway</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">JWT Token (WebAPI)</label>
          <textarea
            bind:value={createForm.jwt_token}
            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm"
            rows="3"
            placeholder="eyJhbGciOiJIUzI1NiIs..."
          ></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">OpenAPI Key (Paid)</label>
          <input
            type="text"
            bind:value={createForm.api_key_paid}
            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm"
            placeholder="sk-..."
          />
        </div>

        <div class="flex items-center gap-2">
          <input type="checkbox" bind:checked={createForm.is_private} id="is_private" />
          <label for="is_private" class="text-sm text-gray-300">
            Private (only you can use this account)
          </label>
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" on:click={() => (showCreateModal = false)} class="flex-1 btn">
            Cancel
          </button>
          <button type="submit" class="flex-1 btn btn-primary">Create Account</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Set Credits Modal -->
{#if showCreditModal && selectedAccount}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" on:click={() => (showCreditModal = false)}>
    <div class="card max-w-md w-full" on:click|stopPropagation>
      <h2 class="text-2xl font-bold mb-6">Set Credits</h2>
      <p class="text-gray-400 mb-6">{selectedAccount.email}</p>

      <form on:submit|preventDefault={handleSetCredit} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Credit Type</label>
          <select
            bind:value={creditForm.credit_type}
            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="webapi">WebAPI (Free)</option>
            <option value="openapi">OpenAPI (Paid)</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Amount</label>
          <input
            type="number"
            bind:value={creditForm.amount}
            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            min="0"
            required
          />
        </div>

        <div class="flex gap-3 mt-6">
          <button type="button" on:click={() => (showCreditModal = false)} class="flex-1 btn">
            Cancel
          </button>
          <button type="submit" class="flex-1 btn btn-primary">Set Credits</button>
        </div>
      </form>
    </div>
  </div>
{/if}
