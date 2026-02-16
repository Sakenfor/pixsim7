import { Dropdown, DropdownDivider, DropdownItem } from '@pixsim7/shared.ui';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';

export interface PresetContextMenuState {
  presetId: string;
  x: number;
  y: number;
}

interface PresetContextMenuProps {
  menu: PresetContextMenuState;
  onClose: () => void;
  onRename: (presetId: string) => void;
  onUpdate: (presetId: string) => void;
  onDelete: (presetId: string) => void;
}

export function PresetContextMenu({
  menu,
  onClose,
  onRename,
  onUpdate,
  onDelete,
}: PresetContextMenuProps) {
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        zIndex: 60,
      }}
    >
      <Dropdown
        isOpen
        onClose={onClose}
        positionMode="static"
        minWidth="140px"
      >
        <DropdownItem
          icon={<Icon name="edit" size={12} />}
          onClick={() => {
            onRename(menu.presetId);
            onClose();
          }}
        >
          Rename
        </DropdownItem>
        <DropdownItem
          icon={<Icon name="save" size={12} />}
          onClick={() => {
            onUpdate(menu.presetId);
            onClose();
          }}
        >
          Update with current filters
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem
          variant="danger"
          icon={<Icon name="trash" size={12} />}
          onClick={() => {
            onDelete(menu.presetId);
            onClose();
          }}
        >
          Delete
        </DropdownItem>
      </Dropdown>
    </div>,
    document.body,
  );
}
