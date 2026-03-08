export {
  PROJECT_BUNDLE_EXTENSION_KEY_PATTERN,
  projectBundleExtensionRegistry,
  registerProjectBundleExtension,
  unregisterProjectBundleExtension,
} from './registry';

export { exportWorldProjectWithExtensions, importWorldProjectWithExtensions } from './service';

export {
  hasAuthoringProjectBundleContributor,
  listAuthoringProjectBundleContributors,
  registerAuthoringProjectBundleContributor,
  unregisterAuthoringProjectBundleContributor,
  isAnyAuthoringProjectBundleContributorDirty,
  listDirtyAuthoringProjectBundleContributors,
  clearAuthoringProjectBundleDirtyState,
  subscribeAuthoringProjectBundleDirtyState,
} from './contributors';

export {
  discoverAuthoringProjectBundleContributors,
  autoRegisterAuthoringProjectBundleContributors,
} from './autoDiscover';

export {
  AUTOSAVE_INTERVAL_MS,
  performAutosave,
  startAutosave,
  stopAutosave,
  clearDraftAfterSave,
} from './autosave';

export type {
  ProjectBundleExportContext,
  ProjectBundleImportContext,
  ProjectBundleExtensionImportOutcome,
  ProjectBundleExtensionHandler,
  AuthoringProjectBundleContributor,
  ProjectBundleExtensionExportReport,
  ProjectBundleExtensionImportReport,
  ExportWorldProjectWithExtensionsResult,
  ImportWorldProjectWithExtensionsResult,
} from './types';

export type {
  DiscoveredAuthoringProjectBundleContributor,
  AutoRegisterAuthoringProjectBundleContributorsOptions,
  AutoRegisterAuthoringProjectBundleContributorsResult,
} from './autoDiscover';
