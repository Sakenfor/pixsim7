/**
 * Related Assets Modal
 *
 * Displays a MiniGallery filtered by a shared source attribute
 * (same folder, same site, same source video, etc.).
 * Driven by useRelatedAssetsStore — triggered from the "More from..." context menu.
 */
import { Modal } from '@pixsim7/shared.ui';

import { MiniGallery } from '@features/gallery';

import { useRelatedAssetsStore } from '../stores/relatedAssetsStore';

export function RelatedAssetsModal() {
  const isOpen = useRelatedAssetsStore((s) => s.isOpen);
  const title = useRelatedAssetsStore((s) => s.title);
  const filters = useRelatedAssetsStore((s) => s.filters);
  const close = useRelatedAssetsStore((s) => s.close);

  if (!isOpen) return null;

  return (
    <Modal isOpen onClose={close} title={title} size="lg">
      <div className="h-[70vh] overflow-hidden">
        <MiniGallery
          initialFilters={filters}
          showSearch
          showSort
          showMediaType
        />
      </div>
    </Modal>
  );
}
