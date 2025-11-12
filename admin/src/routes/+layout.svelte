<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import '../app.css';

  $: isLoginPage = $page.url.pathname === '/login';
  $: showNav = $authStore.isAuthenticated && !isLoginPage;

  onMount(() => {
    authStore.init();
    authStore.requireAuth($page.url.pathname);
  });

  function handleLogout() {
    authStore.logout();
  }
</script>

<div class="min-h-screen flex flex-col">
  {#if showNav}
    <!-- Navigation -->
    <nav class="bg-gray-800 border-b border-gray-700">
      <div class="container mx-auto px-4">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center space-x-8">
            <h1 class="text-xl font-bold text-blue-400">PixSim7 Admin</h1>

            <div class="flex space-x-4">
              <a href="/" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                📊 Dashboard
              </a>
              <a href="/accounts" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                👤 Accounts
              </a>
              <a href="/jobs" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                ⚙️ Jobs
              </a>
              <a href="/assets" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                🎬 Assets
              </a>
              <a href="/services" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                🔧 Services
              </a>
              <a href="/logs" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                📝 Logs
              </a>
              <a href="/database" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                🗄️ Database
              </a>
            </div>
          </div>

          <div class="flex items-center space-x-4">
            <div class="w-2 h-2 rounded-full bg-green-500" title="Connected"></div>
            <button
              on:click={handleLogout}
              class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  {/if}

  <!-- Main content -->
  <main class="flex-1 {isLoginPage ? '' : 'container mx-auto px-4 py-8'}">
    <slot />
  </main>
</div>
