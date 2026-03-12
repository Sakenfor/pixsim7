import { SceneManagementPanel } from './SceneManagementPanel';

/**
 * Legacy scene panel entrypoint kept for backward compatibility.
 * Opens Scene Management directly on the Builder tab.
 */
export function LegacyScenePanel() {
  return <SceneManagementPanel initialTab="builder" />;
}
