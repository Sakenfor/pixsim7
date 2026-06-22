// eslint-disable-next-line import/no-internal-modules -- policy derives from normalized panel catalog entries
import { panelSelectors } from '../plugins/catalogSelectors';

export interface PanelOpenPolicy {
  allowMultiple: boolean;
  maxInstances?: number;
  title?: string;
}

/**
 * Resolve normalized open policy for a panel definition ID.
 * Centralizes instance-policy lookups so all launch surfaces agree.
 */
export function resolvePanelOpenPolicy(panelId: string): PanelOpenPolicy {
  const definition = panelSelectors.get(panelId);
  return {
    allowMultiple: definition?.supportsMultipleInstances === true,
    maxInstances: definition?.maxInstances,
    title: definition?.title,
  };
}
