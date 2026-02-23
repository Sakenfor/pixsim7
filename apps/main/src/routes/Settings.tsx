import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useControlCenterLayout } from '@features/controlCenter';
import { SettingsPanel, useSettingsUiStore } from '@features/settings';

export function SettingsRoute() {
  const { style: layoutStyle } = useControlCenterLayout();
  const [searchParams] = useSearchParams();
  const section = searchParams.get('section');
  const setActiveTabId = useSettingsUiStore((s) => s.setActiveTabId);

  // Sync URL section param to settings tab
  useEffect(() => {
    if (section) {
      setActiveTabId(section);
    }
  }, [section, setActiveTabId]);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={layoutStyle}>
      <div className="flex-1 overflow-y-auto p-6">
        <SettingsPanel />
      </div>
    </div>
  );
}
