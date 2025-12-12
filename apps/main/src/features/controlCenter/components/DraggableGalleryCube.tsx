import { DraggableCube, DraggableCubeProps } from './DraggableCube';
import { useGalleryCubeFaceContent } from './GalleryCubeFaceContent';

/**
 * Gallery Cube with dynamic asset thumbnails
 *
 * Wraps DraggableCube to provide asset-based face content
 */
export function DraggableGalleryCube(props: Omit<DraggableCubeProps, 'faceContent'>) {
  const faceContent = useGalleryCubeFaceContent(props.cubeId);

  return <DraggableCube {...props} faceContent={faceContent} />;
}
