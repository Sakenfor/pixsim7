import { useAuthStore } from '../stores/authStore';
import { moduleRegistry } from '../modules';
import { Button, Panel, ThemeToggle } from '@pixsim7/ui';

export function Home() {
  const { user, logout } = useAuthStore();

  const modules = moduleRegistry.list();

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-10 content-with-dock min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">PixSim7 - Interactive Video Platform</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Welcome, {user?.username}!</p>
        </div>
        <div className="flex gap-2">
          <ThemeToggle />
          <Button variant="secondary" onClick={logout}>Logout</Button>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Quick Access</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <Panel className="space-y-2">
            <h3 className="font-medium">🖼️ Gallery</h3>
            <p className="text-xs text-neutral-500">Browse and manage generated assets</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/assets', '_self')}>Open Gallery</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium">🎨 Scene Builder</h3>
            <p className="text-xs text-neutral-500">Create and edit scenes with timeline</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/workspace', '_self')}>Open Workspace</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium">❤️ Health Monitor</h3>
            <p className="text-xs text-neutral-500">Monitor system health and job status</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/health', '_self')}>Open Health</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium">🤖 Automation</h3>
            <p className="text-xs text-neutral-500">Manage Android devices and automation loops</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/automation', '_self')}>Open Automation</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium">⚙️ Provider Settings</h3>
            <p className="text-xs text-neutral-500">Manage provider accounts and capacity</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/providers', '_self')}>Open Settings</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium">🕸️ Graph View</h3>
            <p className="text-xs text-neutral-500">Visualize asset dependencies and relationships</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/graph/1', '_self')}>Open Graph</Button>
            </div>
          </Panel>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Available Modules</h2>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">These modules are registered but not yet implemented. They will be developed incrementally.</p>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => (
            <Panel key={module.id} className="space-y-2">
              <h3 className="font-medium">{module.name}</h3>
              <p className="text-xs text-neutral-500">ID: {module.id}</p>
              <p className="text-xs text-neutral-400">Status: {module.isReady?.() ? '✓ Ready' : '○ Not Ready'}</p>
              {module.id === 'scene-builder' && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="secondary" onClick={() => window.open('/workspace', '_self')}>Open Workspace</Button>
                  <Button size="sm" variant="primary" onClick={() => {
                    // open game in new tab
                    const gameUrl = import.meta.env.VITE_GAME_URL || 'http://localhost:5174'
                    window.open(gameUrl, '_blank','noopener')
                  }}>Open Game</Button>
                </div>
              )}
            </Panel>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Next Steps</h2>
        <ul className="list-disc pl-5 text-sm space-y-1 text-neutral-600 dark:text-neutral-300">
          <li>Implement Gallery Module for browsing and managing media assets</li>
          <li>Build Scene Builder Module for creating interactive video experiences</li>
          <li>Add Playback Module for rendering scenes with user choices</li>
          <li>Develop Collaboration features for team workflows</li>
        </ul>
      </section>
    </div>
  );
}
