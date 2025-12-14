/**
 * @deprecated Comic panel helpers moved to @features/scene/ui/comicPanels.
 * Re-exported here to avoid breaking existing imports.
 */
export {
  getActiveComicPanels,
  getComicPanelById,
  getComicPanelsByTags,
  getComicPanelAssetIds,
  setCurrentComicPanel,
  clearCurrentComicPanel,
  ComicPanelView,
  type ComicPanelViewProps,
  type ComicPanelLayout,
  type SceneMetaComicPanel,
  type ComicSessionFlags,
  type ComicPanelSession,
  type ComicPanelSceneMeta,
} from '@features/scene/ui/comicPanels';
