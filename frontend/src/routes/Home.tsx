import { useAuthStore } from '../stores/authStore';
import { moduleRegistry } from '../modules';
import { Button, Panel, ThemeToggle } from '@pixsim7/ui';
import { Icon } from '../lib/icons';

export function Home() {
  const { user, logout } = useAuthStore();

  const modules = moduleRegistry.list();

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-10 content-with-dock min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-6 flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">PixSim7 - Interactive Video Platform</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Welcome, {user?.username}! The workspace lets you orchestrate gallery, scene, graph, and health panels.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => window.open('/workspace', '_self')}
            >
              Open Workspace
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.open('/assets', '_self')}
            >
              Open Gallery
            </Button>
          </div>
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
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="image" size={18} />
              Gallery
            </h3>
            <p className="text-xs text-neutral-500">Browse and manage generated assets</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/assets', '_self')}>Open Gallery</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="palette" size={18} />
              Scene Builder
            </h3>
            <p className="text-xs text-neutral-500">Create and edit scenes with timeline</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/workspace', '_self')}>Open Workspace</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="heart" size={18} className="text-red-500" />
              Health Monitor
            </h3>
            <p className="text-xs text-neutral-500">Monitor system health and job status</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/health', '_self')}>Open Health</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="bot" size={18} />
              Automation
            </h3>
            <p className="text-xs text-neutral-500">Manage Android devices and automation loops</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/automation', '_self')}>Open Automation</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="settings" size={18} />
              Provider Settings
            </h3>
            <p className="text-xs text-neutral-500">Manage provider accounts and capacity</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/providers', '_self')}>Open Settings</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="graph" size={18} />
              Graph View
            </h3>
            <p className="text-xs text-neutral-500">Visualize asset dependencies and relationships</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/graph/1', '_self')}>Open Graph</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="book" size={18} className="text-indigo-500" />
              Arc Graph Editor
            </h3>
            <p className="text-xs text-neutral-500">Manage story arcs, quests, and narrative flow</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/arc-graph', '_self')}>Open Arc Graph</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="map" size={18} />
              Game World
            </h3>
            <p className="text-xs text-neutral-500">Configure locations and hotspots for 3D scenes</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/game-world', '_self')}>Open Game World</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="play" size={18} />
              2D Game
            </h3>
            <p className="text-xs text-neutral-500">Play the turn-based 2D day cycle game</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/game-2d', '_self')}>Play 2D Game</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="sparkles" size={18} className="text-purple-500" />
              Gizmo Lab
            </h3>
            <p className="text-xs text-neutral-500">Explore and test gizmos and interactive tools</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/gizmo-lab', '_self')}>Open Gizmo Lab</Button>
            </div>
          </Panel>

          <Panel className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="user" size={18} />
              NPC Portraits
            </h3>
            <p className="text-xs text-neutral-500">Configure NPC expressions mapped to assets</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="primary" onClick={() => window.open('/npc-portraits', '_self')}>Open NPC Portraits</Button>
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
              <p className="text-xs text-neutral-400 flex items-center gap-1">
                Status: {module.isReady?.() ? (
                  <><Icon name="check" size={12} className="text-green-500" /> Ready</>
                ) : (
                  <>○ Not Ready</>
                )}
              </p>
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
