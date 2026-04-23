import { SidebarContentLayout, type SidebarContentLayoutSection, useSidebarNav } from '@pixsim7/shared.ui';
import { useMemo } from 'react';

import { Icon } from '@lib/icons';

import { DeviceList, PresetList, ExecutionList, LoopList } from '@features/automation';

type AutomationSectionId = 'devices' | 'presets' | 'executions' | 'loops';

function buildSections(): SidebarContentLayoutSection[] {
  return [
    { id: 'devices', label: 'Devices', icon: <Icon name="cpu" size={14} className="flex-shrink-0" /> },
    { id: 'presets', label: 'Action Presets', icon: <Icon name="settings" size={14} className="flex-shrink-0" /> },
    { id: 'executions', label: 'Executions', icon: <Icon name="play" size={14} className="flex-shrink-0" /> },
    { id: 'loops', label: 'Automation Loops', icon: <Icon name="refreshCw" size={14} className="flex-shrink-0" /> },
  ];
}

function renderSection(sectionId: AutomationSectionId) {
  switch (sectionId) {
    case 'devices':
      return <DeviceList />;
    case 'presets':
      return <PresetList />;
    case 'executions':
      return <ExecutionList />;
    case 'loops':
      return <LoopList />;
    default:
      return null;
  }
}

export function AutomationRoute() {
  const sections = useMemo(() => buildSections(), []);
  const nav = useSidebarNav<AutomationSectionId>({
    sections,
    initial: 'devices',
    storageKey: 'automation:nav',
  });

  return (
    <div className="h-full min-h-0 w-full flex bg-white dark:bg-neutral-900">
      <SidebarContentLayout
        sections={sections}
        activeSectionId={nav.activeSectionId}
        onSelectSection={nav.selectSection}
        sidebarTitle="Automation"
        sidebarWidth="w-56"
        variant="light"
        navClassName="space-y-1"
        collapsible
        expandedWidth={224}
        persistKey="automation-sidebar"
        autoHideTitle={false}
        contentClassName="overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-7xl p-6">
          {renderSection(nav.activeSectionId as AutomationSectionId)}
        </div>
      </SidebarContentLayout>
    </div>
  );
}
