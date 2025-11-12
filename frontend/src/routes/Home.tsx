import { useAuthStore } from '../stores/authStore';
import { moduleRegistry } from '../modules';

export function Home() {
  const { user, logout } = useAuthStore();

  const modules = moduleRegistry.list();

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '40px', borderBottom: '1px solid #ddd', paddingBottom: '20px' }}>
        <h1>PixSim7 - Interactive Video Platform</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
          <p>Welcome, {user?.username}!</p>
          <button
            onClick={logout}
            style={{
              padding: '8px 16px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <section style={{ marginBottom: '40px' }}>
        <h2>Available Modules</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          These modules are registered but not yet implemented. They will be developed incrementally.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {modules.map((module) => (
            <div
              key={module.id}
              style={{
                padding: '20px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                background: '#f9f9f9',
              }}
            >
              <h3>{module.name}</h3>
              <p style={{ color: '#666', fontSize: '14px' }}>ID: {module.id}</p>
              <p style={{ marginTop: '10px', fontSize: '12px', color: '#999' }}>
                Status: {module.isReady?.() ? '✓ Ready' : '○ Not Ready'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Next Steps</h2>
        <ul style={{ lineHeight: '2' }}>
          <li>Implement Gallery Module for browsing and managing media assets</li>
          <li>Build Scene Builder Module for creating interactive video experiences</li>
          <li>Add Playback Module for rendering scenes with user choices</li>
          <li>Develop Collaboration features for team workflows</li>
        </ul>
      </section>
    </div>
  );
}
