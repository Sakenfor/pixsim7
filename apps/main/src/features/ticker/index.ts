/**
 * Ticker feature — pluggable news-style scrolling marquee.
 *
 * Public surface:
 * - `<Ticker />`            — generic consumer; renders enabled sources.
 * - `<GenerationActivityIndicator />` — generations-specific badge sibling.
 * - `registerTickerSource`  — for new source modules.
 * - `useTickerSettingsStore` — settings UI integration.
 *
 * Side-effect registrations live in `sources.registrations.ts` and are
 * imported eagerly from `main.tsx` (see `stores-registry-canon`).
 */

export { Ticker } from './components/Ticker';
export { GenerationActivityIndicator } from './components/GenerationActivityIndicator';

export {
  registerTickerSource,
  unregisterTickerSource,
  getTickerSource,
  listTickerSources,
  subscribeToTickerRegistry,
  type TickerEvent,
  type TickerSource,
} from './lib/sourceRegistry';

export {
  useTickerSettingsStore,
  isSourceEnabled,
  getSourceSettings,
} from './stores/tickerSettingsStore';

export { handleTickerEventClick } from './lib/clickThrough';
