import { useState } from 'react';
import { DeviceList, PresetList, ExecutionList, LoopList } from '@features/automation';

type AutomationTab = 'devices' | 'presets' | 'executions' | 'loops';

export function AutomationRoute() {
  const [activeTab, setActiveTab] = useState<AutomationTab>('devices');

  const tabs: { id: AutomationTab; label: string; icon: string }[] = [
    { id: 'devices', label: 'Devices', icon: '📱' },
    { id: 'presets', label: 'Action Presets', icon: '⚙️' },
    { id: 'executions', label: 'Executions', icon: '▶️' },
    { id: 'loops', label: 'Automation Loops', icon: '🔁' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Automation
            </h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'devices' && <DeviceList />}
        {activeTab === 'presets' && <PresetList />}
        {activeTab === 'executions' && <ExecutionList />}
        {activeTab === 'loops' && <LoopList />}
      </div>
    </div>
  );
}
