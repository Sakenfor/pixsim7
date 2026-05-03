import { useEffect } from 'react';

import { MiniGallery, type MiniGalleryProps } from '@features/gallery/components/MiniGallery';
import { useUnseenProbesStore } from '@features/generation/stores/unseenProbesStore';

export function ProbesPanel(props: MiniGalleryProps) {
  // Tell the unseen-probes counter the panel is mounted (suppresses badge
  // increments + resets the count). Untoggles on unmount so subsequent probe
  // arrivals start counting again.
  const setPanelOpen = useUnseenProbesStore((s) => s.setPanelOpen);
  useEffect(() => {
    setPanelOpen(true);
    return () => setPanelOpen(false);
  }, [setPanelOpen]);

  return (
    <MiniGallery
      {...props}
      initialFilters={{ asset_kind: 'probe', sort: 'new' }}
      sourceLabel="Probes"
      panelId="probes"
    />
  );
}
