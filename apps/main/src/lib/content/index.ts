export {
  type ContentSourceCategory,
  type ContentSourceSummary,
  type ContentSourceDescriptor,
  CONTENT_SOURCE_CATEGORIES,
  CONTENT_SOURCE_CATEGORY_ORDER,
  registerContentSource,
  getContentSources,
  getContentSourcesByCategory,
  getContentSource,
} from './contentSourceRegistry';

// Side-effect: registers all built-in content sources
import './contentSources';
