// Wrapper around pixcubes CubeConnectionsOverlay with pixsim7-specific dependencies
import { CubeConnectionsOverlay as PixcubesCubeConnectionsOverlay } from '@pixsim7/scene.cubes';
import { useControlCubeStore } from '@features/controlCenter/stores/controlCubeStore';

export function CubeConnectionsOverlay() {
  return <PixcubesCubeConnectionsOverlay useStore={useControlCubeStore} />;
}
