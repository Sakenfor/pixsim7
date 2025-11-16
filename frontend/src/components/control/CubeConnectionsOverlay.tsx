// Wrapper around pixcubes CubeConnectionsOverlay with pixsim7-specific dependencies
import { CubeConnectionsOverlay as PixcubesCubeConnectionsOverlay } from 'pixcubes';
import { useControlCubeStore } from '../../stores/controlCubeStore';

export function CubeConnectionsOverlay() {
  return <PixcubesCubeConnectionsOverlay useStore={useControlCubeStore} />;
}
