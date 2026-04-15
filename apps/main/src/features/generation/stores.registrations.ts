/**
 * Generation feature — store registry declarations.
 *
 * Side-effect module imported eagerly at app bootstrap so the store registry
 * knows about deprecated patterns / managed prefixes before `pruneOrphans`
 * runs. Kept separate from heavier component modules so we don't pull in
 * full component trees during bootstrap.
 */

import { registerDeprecatedKeys } from '@lib/stores';

// QuickGenWidget v2 layout scheme bucketed layouts per operationType, leaving
// stale arrangements that could resurface after HMR. The new scheme keys only
// by layout shape — old per-op entries should be wiped.
registerDeprecatedKeys([/^dockview:[^:]+:(v2|v2t):(with-asset|no-asset):.+$/]);
