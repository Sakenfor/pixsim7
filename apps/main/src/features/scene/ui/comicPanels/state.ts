import type { ComicPanelSession } from './types';

/**
 * Update session flags to point at a specific comic panel.
 */
export function setCurrentComicPanel<TSession extends ComicPanelSession>(
  session: TSession,
  panelId: string
): TSession {
  return {
    ...session,
    flags: {
      ...session.flags,
      comic: {
        ...session.flags?.comic,
        current_panel: panelId,
      },
    },
  } as TSession;
}

/**
 * Remove the current panel selection from session flags.
 */
export function clearCurrentComicPanel<TSession extends ComicPanelSession>(
  session: TSession
): TSession {
  const { comic, ...otherFlags } = session.flags || {};
  const { current_panel, ...otherComicFlags } = comic || {};

  return {
    ...session,
    flags: {
      ...otherFlags,
      ...(Object.keys(otherComicFlags).length > 0 ? { comic: otherComicFlags } : {}),
    },
  } as TSession;
}
