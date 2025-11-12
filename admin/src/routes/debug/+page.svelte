<script lang="ts">
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  // Simple token entry for now; later hook real auth
  let token = '';

  // Tabs
  let tab: 'generation' | 'sync' | 'lineage' = 'generation';
  let providerData: any[] = [];
  let providerLoadError: string | null = null;
  let loadingProviders = false;

  // Generation dynamic form
  let providerId = 'pixverse';
  let selectedOperation = 'text_to_video';
  let paramSpecs: any[] = []; // current operation parameter spec entries
  let paramValues: Record<string, any> = {}; // bound inputs
  let paramDefaults: Record<string, any> = {}; // defaults snapshot
  let changedParams: string[] = []; // names changed from defaults
  const GROUP_ORDER = ['core','render','dimensions','source','style','advanced'];
  let groupedSpecs: Record<string, any[]> = {};
  let jobPollInterval: any = null;
  let lastJob: any = null;
  let generationResult: any = null;
  let generationError: string | null = null;
  let isGenerating = false;

  // Accounts for Pixverse selection
  let accounts: any[] = [];
  let loadingAccounts = false;
  let accountError: string | null = null;
  let selectedAccountId: number | null = null;

  async function loadAccounts() {
    if (!token) return; // Accounts require auth
    loadingAccounts = true;
    accountError = null;
    try {
      const data = await api('/api/v1/accounts?provider_id=pixverse', { token });
      accounts = data || [];
      if (!selectedAccountId && accounts.length) selectedAccountId = accounts[0].id;
    } catch (e: any) {
      accountError = e.message;
    } finally {
      loadingAccounts = false;
    }
  }

  $: if (providerId === 'pixverse' && tab === 'generation') {
    if (accounts.length === 0 && !loadingAccounts) loadAccounts();
  }

  function buildParamState() {
    const provider = providerData.find(p => p.provider_id === providerId);
    if (!provider || !provider.capabilities || !provider.capabilities.operation_specs) {
      paramSpecs = [];
      paramValues = {};
      paramDefaults = {};
      groupedSpecs = {};
      return;
    }
    const opSpec = provider.capabilities.operation_specs[selectedOperation];
    paramSpecs = opSpec ? opSpec.parameters : [];
    const newValues: Record<string, any> = {};
    const defaults: Record<string, any> = {};
    for (const p of paramSpecs) {
      newValues[p.name] = p.default !== undefined ? p.default : (p.required ? '' : null);
      defaults[p.name] = p.default !== undefined ? p.default : (p.required ? '' : null);
    }
    paramValues = newValues;
    paramDefaults = defaults;
    regroupSpecs();
  }

  $: if (providerData.length) {
    // Ensure selectedOperation is valid for provider
    const provider = providerData.find(p => p.provider_id === providerId);
    if (provider) {
      if (!provider.supported_operations.includes(selectedOperation)) {
        selectedOperation = provider.supported_operations[0];
      }
    }
    buildParamState();
  }

  async function runGeneration() {
    generationError = null;
    generationResult = null;
    isGenerating = true;
    try {
      // Build params object from dynamic values
      const params: Record<string, any> = {};
      for (const spec of paramSpecs) {
        let val = paramValues[spec.name];
        if (val === '' || val === null || val === undefined) {
          if (spec.required) {
            throw new Error(`Missing required field: ${spec.name}`);
          } else {
            continue;
          }
        }
        if (spec.type === 'array' && typeof val === 'string') {
          val = val.split(',').map(v => v.trim()).filter(v => v.length);
        }
        if (spec.type === 'number' || spec.type === 'integer') {
          const num = Number(val);
          if (isNaN(num)) throw new Error(`Invalid number for ${spec.name}`);
          if (spec.min !== undefined && num < spec.min) throw new Error(`${spec.name} < min ${spec.min}`);
          if (spec.max !== undefined && num > spec.max) throw new Error(`${spec.name} > max ${spec.max}`);
          val = num;
        }
        params[spec.name] = val;
      }
      // Inject account-specific hints for Pixverse (e.g., use_method based on credits).
      if (providerId === 'pixverse' && selectedAccountId) {
        params.account_id = selectedAccountId; // For future backend extension if needed
      }

      const res = await api('/api/v1/jobs', {
        method: 'POST',
        token,
        body: {
          provider_id: providerId,
          operation_type: selectedOperation, // backend enum uses lower snake case
          params
        }
      });
      // If backend expects lower case snake (text_to_video) adjust:
      if (res && res.operation_type && res.operation_type !== selectedOperation) {
        // No-op; server normalized
      }
      generationResult = res;
      lastJob = res;
      startJobPolling(res.id);
    } catch (e: any) {
      generationError = e.message;
    } finally {
      isGenerating = false;
    }
  }

  function regroupSpecs() {
    const groups: Record<string, any[]> = {};
    for (const spec of paramSpecs) {
      const g = spec.group || 'core';
      if (!groups[g]) groups[g] = [];
      groups[g].push(spec);
    }
    // order groups
    const ordered: Record<string, any[]> = {};
    for (const g of GROUP_ORDER) {
      if (groups[g]) ordered[g] = groups[g];
    }
    // append any extra groups not in order list
    for (const g of Object.keys(groups)) {
      if (!ordered[g]) ordered[g] = groups[g];
    }
    groupedSpecs = ordered;
  }

  function computeChanges() {
    const changed: string[] = [];
    for (const k of Object.keys(paramValues)) {
      if (paramValues[k] !== paramDefaults[k]) changed.push(k);
    }
    changedParams = changed;
  }

  function resetParams() {
    for (const k of Object.keys(paramDefaults)) {
      paramValues[k] = paramDefaults[k];
    }
    computeChanges();
  }

  // Persist & restore state
  const LS_KEY = 'pixsim7_debug_gen_state';
  onMount(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.providerId) providerId = saved.providerId;
        if (saved.selectedOperation) selectedOperation = saved.selectedOperation;
        if (saved.paramValues) paramValues = saved.paramValues;
      }
    } catch {}
  });

  $: computeChanges();

  $: saveState();
  function saveState() {
    try {
      const payload = JSON.stringify({ providerId, selectedOperation, paramValues });
      localStorage.setItem(LS_KEY, payload);
    } catch {}
  }

  async function loadProviders() {
    loadingProviders = true;
    providerLoadError = null;
    try {
      const data = await api('/api/v1/providers', { token });
      providerData = data || [];
    } catch (e: any) {
      providerLoadError = e.message;
    } finally {
      loadingProviders = false;
    }
  }

  $: if (tab === 'generation') {
    // Attempt provider load whenever generation tab active
    if (providerData.length === 0 && !loadingProviders) {
      loadProviders();
    }
  }

  function startJobPolling(jobId: number) {
    clearInterval(jobPollInterval);
    jobPollInterval = setInterval(async () => {
      try {
        const j = await api(`/api/v1/jobs/${jobId}`, { token });
        lastJob = j;
        if (j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled') {
          clearInterval(jobPollInterval);
        }
      } catch (e) {
        clearInterval(jobPollInterval);
      }
    }, 2500);
  }

  // Sync
  let syncAssetId: number | null = null;
  let syncResult: any = null;
  let syncError: string | null = null;
  let isSyncing = false;

  async function runSync() {
    if (!syncAssetId) return;
    syncError = null;
    syncResult = null;
    isSyncing = true;
    try {
      const res = await api(`/api/v1/assets/${syncAssetId}/sync`, {
        method: 'POST',
        token
      });
      syncResult = res;
    } catch (e: any) {
      syncError = e.message;
    } finally {
      isSyncing = false;
    }
  }

  // Lineage
  let lineageAssetId: number | null = null;
  let parents: number[] = [];
  let children: number[] = [];
  let lineageError: string | null = null;
  let isLoadingLineage = false;

  async function loadLineage() {
    if (!lineageAssetId) return;
    lineageError = null;
    parents = [];
    children = [];
    isLoadingLineage = true;
    try {
      const p = await api(`/api/v1/lineage/assets/${lineageAssetId}/parents`, { token });
      const c = await api(`/api/v1/lineage/assets/${lineageAssetId}/children`, { token });
      parents = p?.parents ?? [];
      children = c?.children ?? [];
    } catch (e: any) {
      lineageError = e.message;
    } finally {
      isLoadingLineage = false;
    }
  }
</script>

<div class="p-6 space-y-6">
  <h1 class="text-2xl font-semibold">Admin Debug</h1>

  <div class="flex items-center gap-2">
  <label for="debug-token" class="text-sm text-gray-500">Bearer Token</label>
  <input id="debug-token" class="border rounded px-2 py-1 w-[480px]" type="text" bind:value={token} placeholder="paste JWT token here" />
  </div>

  <div class="border-b border-gray-200">
    <nav class="flex gap-4 -mb-px">
      <button class={`px-3 py-2 border-b-2 ${tab==='generation'?'border-blue-600 text-blue-600':'border-transparent'}`} on:click={() => tab='generation'}>Generation</button>
      <button class={`px-3 py-2 border-b-2 ${tab==='sync'?'border-blue-600 text-blue-600':'border-transparent'}`} on:click={() => tab='sync'}>Sync</button>
      <button class={`px-3 py-2 border-b-2 ${tab==='lineage'?'border-blue-600 text-blue-600':'border-transparent'}`} on:click={() => tab='lineage'}>Lineage</button>
    </nav>
  </div>

  {#if tab === 'generation'}
    <section class="space-y-4">
      <div class="border rounded p-3 bg-gray-50">
        <h3 class="text-sm font-medium mb-2">Provider Capabilities</h3>
        {#if loadingProviders}
          <div class="text-xs text-gray-500">Loading providers...</div>
        {:else if providerLoadError}
          <div class="text-xs text-red-600">{providerLoadError}</div>
        {:else if providerData.length === 0}
          <div class="text-xs text-gray-500">No providers loaded.</div>
        {:else}
          <div class="space-y-2">
            {#each providerData as p}
              <div class="border rounded bg-white p-2">
                <div class="flex justify-between items-center">
                  <div class="font-semibold text-sm">{p.name}</div>
                  <div class="text-xs text-gray-500">ID: {p.provider_id}</div>
                </div>
                <div class="mt-1 text-xs">
                  <div><span class="font-medium">Operations:</span> {p.supported_operations.join(', ')}</div>
                  {#if p.capabilities}
                    <div class="mt-1"><span class="font-medium">Quality Presets:</span> {p.capabilities.quality_presets?.join(', ') || '—'}</div>
                    {#if p.capabilities.aspect_ratios}
                      <div><span class="font-medium">Aspect Ratios:</span> {p.capabilities.aspect_ratios.join(', ')}</div>
                    {/if}
                    <div><span class="font-medium">Default Model:</span> {p.capabilities.default_model || '—'}</div>
                    <div class="mt-1"><span class="font-medium">Features:</span>
                      {#each Object.entries(p.capabilities.features || {}) as [k,v]}
                        <span class="inline-block px-2 py-0.5 rounded bg-gray-100 mr-1 mt-1">{k}:{v ? 'yes' : 'no'}</span>
                      {/each}
                    </div>
                    {#if p.capabilities.parameter_hints}
                      <details class="mt-2">
                        <summary class="cursor-pointer text-xs font-medium">Parameter Hints</summary>
                        <div class="mt-1 space-y-1">
                          {#each Object.entries(p.capabilities.parameter_hints) as [op, hintsRaw]}
                            {#if Array.isArray(hintsRaw)}
                              <div class="text-xs"><span class="font-semibold">{op}:</span> {hintsRaw.join(', ')}</div>
                            {:else}
                              <div class="text-xs"><span class="font-semibold">{op}:</span> {String(hintsRaw)}</div>
                            {/if}
                          {/each}
                        </div>
                      </details>
                    {/if}
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="space-y-2">
          <div class="flex justify-between items-center">
            <label for="provider-select" class="block text-sm">Provider</label>
            <button type="button" class="text-xs px-2 py-1 rounded border bg-white" on:click={loadProviders} disabled={loadingProviders}>Reload</button>
          </div>
          <select id="provider-select" class="border rounded px-2 py-1 w-full" bind:value={providerId}>
            {#if loadingProviders}
              <option disabled>Loading...</option>
            {:else if providerLoadError}
              <option disabled>{providerLoadError}</option>
            {:else if providerData.length === 0}
              <option disabled>No providers</option>
            {:else}
              {#each providerData as p}
                <option value={p.provider_id}>{p.provider_id}</option>
              {/each}
            {/if}
          </select>
        </div>
        <div class="space-y-2">
          <label for="operation-select" class="block text-sm">Operation</label>
          <select id="operation-select" class="border rounded px-2 py-1 w-full" bind:value={selectedOperation}>
            {#each (providerData.find(pp => pp.provider_id === providerId)?.supported_operations || []) as op}
              <option value={op}>{op}</option>
            {/each}
          </select>
        </div>
        <div class="flex items-end">
          <button class="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50" on:click={runGeneration} disabled={isGenerating || paramSpecs.length === 0}>
            {isGenerating ? 'Submitting...' : 'Submit Job'}
          </button>
          <button class="bg-gray-100 text-gray-900 px-3 py-2 rounded border" on:click={resetParams} disabled={paramSpecs.length === 0}>Reset</button>
        </div>
      </div>

      {#if providerId === 'pixverse'}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <label for="account-select" class="block text-sm">Pixverse Account</label>
              <button type="button" class="text-xs px-2 py-1 rounded border bg-white" on:click={loadAccounts} disabled={loadingAccounts}>Reload</button>
            </div>
            <select id="account-select" class="border rounded px-2 py-1 w-full" bind:value={selectedAccountId}>
              {#if loadingAccounts}
                <option disabled>Loading accounts...</option>
              {:else if accountError}
                <option disabled>{accountError}</option>
              {:else if accounts.length === 0}
                <option disabled>No accounts</option>
              {:else}
                {#each accounts as a}
                  <option value={a.id}>{a.email} (#{a.id})</option>
                {/each}
              {/if}
            </select>
          </div>
        </div>
      {/if}

      <!-- Dynamic parameter form -->
      <div class="space-y-4">
        {#if paramSpecs.length === 0}
          <div class="text-xs text-gray-500">No parameter spec available.</div>
        {:else}
          {#each Object.entries(groupedSpecs) as [groupName, specs]}
            <details open>
              <summary class="cursor-pointer select-none text-sm font-semibold mb-2">{groupName}</summary>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each specs as spec, i}
                  <div class="space-y-1">
                    <label class="block text-xs font-medium" for={`param-${groupName}-${i}`}>{spec.name}{spec.required ? ' *' : ''}</label>
                    {#if spec.type === 'enum'}
                      <select id={`param-${groupName}-${i}`} class="border rounded px-2 py-1 text-sm w-full" bind:value={paramValues[spec.name]}>
                        {#each (spec.enum || []) as opt}
                          <option value={opt}>{opt}</option>
                        {/each}
                      </select>
                    {:else if spec.type === 'number' || spec.type === 'integer'}
                      <input id={`param-${groupName}-${i}`} type="number" class="border rounded px-2 py-1 text-sm w-full" bind:value={paramValues[spec.name]} min={spec.min} max={spec.max} />
                    {:else if spec.type === 'array'}
                      <input id={`param-${groupName}-${i}`} type="text" class="border rounded px-2 py-1 text-sm w-full" bind:value={paramValues[spec.name]} placeholder="comma,separated,values" />
                    {:else}
                      <input id={`param-${groupName}-${i}`} type="text" class="border rounded px-2 py-1 text-sm w-full" bind:value={paramValues[spec.name]} />
                    {/if}
                    {#if spec.description}
                      <div class="text-[10px] text-gray-500">{spec.description}</div>
                    {/if}
                  </div>
                {/each}
              </div>
            </details>
          {/each}
          <div class="text-xs text-gray-600">
            <span class="font-medium">Changed:</span> {changedParams.length ? changedParams.join(', ') : 'none'}
          </div>
        {/if}
      </div>
      <!-- Submit button moved above -->
      {#if generationError}
        <div class="text-red-600 text-sm">{generationError}</div>
      {/if}
      {#if generationResult}
        <div class="space-y-2">
          <h3 class="font-medium text-sm">Initial Job Response</h3>
          <pre class="bg-gray-50 p-3 rounded overflow-auto text-xs">{JSON.stringify(generationResult, null, 2)}</pre>
        </div>
      {/if}
      {#if lastJob}
        <div class="space-y-2">
          <h3 class="font-medium text-sm">Live Job Status</h3>
          <pre class="bg-gray-50 p-3 rounded overflow-auto text-xs">{JSON.stringify(lastJob, null, 2)}</pre>
        </div>
      {/if}
    </section>
  {/if}

  {#if tab === 'sync'}
    <section class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div class="space-y-2">
          <label for="sync-asset-id" class="block text-sm">Asset ID</label>
          <input id="sync-asset-id" class="border rounded px-2 py-1 w-full" type="number" bind:value={syncAssetId} />
        </div>
        <div>
          <button class="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50" on:click={runSync} disabled={!syncAssetId || isSyncing}>
            {isSyncing ? 'Syncing...' : 'Run Sync'}
          </button>
        </div>
      </div>
      {#if syncError}
        <div class="text-red-600 text-sm">{syncError}</div>
      {/if}
      {#if syncResult}
        <pre class="bg-gray-50 p-3 rounded overflow-auto text-xs">{JSON.stringify(syncResult, null, 2)}</pre>
      {/if}
    </section>
  {/if}

  {#if tab === 'lineage'}
    <section class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div class="space-y-2">
          <label for="lineage-asset-id" class="block text-sm">Asset ID</label>
          <input id="lineage-asset-id" class="border rounded px-2 py-1 w-full" type="number" bind:value={lineageAssetId} />
        </div>
        <div>
          <button class="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50" on:click={loadLineage} disabled={!lineageAssetId || isLoadingLineage}>
            {isLoadingLineage ? 'Loading...' : 'Load Lineage'}
          </button>
        </div>
      </div>
      {#if lineageError}
        <div class="text-red-600 text-sm">{lineageError}</div>
      {/if}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 class="font-medium mb-2">Parents</h3>
          {#if parents.length === 0}
            <div class="text-sm text-gray-500">None</div>
          {:else}
            <ul class="list-disc list-inside text-sm">
              {#each parents as p}
                <li>Asset {p}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <h3 class="font-medium mb-2">Children</h3>
          {#if children.length === 0}
            <div class="text-sm text-gray-500">None</div>
          {:else}
            <ul class="list-disc list-inside text-sm">
              {#each children as c}
                <li>Asset {c}</li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </section>
  {/if}
</div>
