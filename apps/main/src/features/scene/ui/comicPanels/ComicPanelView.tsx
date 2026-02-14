import type { SceneMetaComicPanel, ComicPanelRequestContext } from './types';

export type ComicPanelLayout = 'single' | 'strip' | 'grid2';

export interface ComicPanelViewProps {
  panels: SceneMetaComicPanel[];
  layout?: ComicPanelLayout;
  showCaption?: boolean;
  className?: string;
  onPanelClick?: (panel: SceneMetaComicPanel) => void;
  requestContext?: ComicPanelRequestContext;
  animate?: boolean;
}

export { ComicPanelSceneView as ComicPanelView } from '../../../../plugins/scene/comic-panel-view/PluginSceneView';
