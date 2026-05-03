import { MiniGallery, type MiniGalleryProps } from '@features/gallery/components/MiniGallery';

export function ProbesPanel(props: MiniGalleryProps) {
  return (
    <MiniGallery
      {...props}
      initialFilters={{ asset_kind: 'probe', sort: 'new' }}
      sourceLabel="Probes"
      panelId="probes"
    />
  );
}
