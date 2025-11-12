<script lang="ts">
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';

  let email = '';
  let password = '';
  let error = '';
  let loading = false;

  async function handleLogin() {
    if (!email || !password) {
      error = 'Please enter email and password';
      return;
    }

    try {
      loading = true;
      error = '';
      await authStore.login(email, password);
      goto('/');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Login failed';
    } finally {
      loading = false;
    }
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleLogin();
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center">
  <div class="card max-w-md w-full">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold mb-2">PixSim7</h1>
      <p class="text-gray-400">Admin Panel</p>
    </div>

    {#if error}
      <div class="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
        <p class="text-red-400">{error}</p>
      </div>
    {/if}

    <form on:submit|preventDefault={handleLogin} class="space-y-6">
      <div>
        <label for="email" class="block text-sm font-medium text-gray-300 mb-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          bind:value={email}
          on:keypress={handleKeyPress}
          class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
          placeholder="admin@example.com"
          disabled={loading}
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium text-gray-300 mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          bind:value={password}
          on:keypress={handleKeyPress}
          class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
          placeholder="••••••••"
          disabled={loading}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        class="w-full btn btn-primary py-3 text-lg font-semibold"
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>

    <div class="mt-6 text-center text-sm text-gray-400">
      <p>Don't have an account?</p>
      <p class="mt-2">Run <code class="bg-gray-800 px-2 py-1 rounded">create-admin.bat</code> to create one</p>
    </div>
  </div>
</div>
