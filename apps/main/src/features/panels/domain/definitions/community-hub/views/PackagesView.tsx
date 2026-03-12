import { Icon } from '@lib/icons';

const PLACEHOLDER_PACKAGES = [
  { name: 'Scene Foundation', version: '1.0.0', description: 'Core scene primitives and layouts' },
  { name: 'Character Pack', version: '0.8.2', description: 'Character templates and presets' },
  { name: 'FX Library', version: '2.1.0', description: 'Visual effects and transitions' },
];

export function PackagesView() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-200">Packages</h2>
        <button className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {PLACEHOLDER_PACKAGES.map((pkg) => (
          <div
            key={pkg.name}
            className="flex items-start gap-3 p-3 rounded-lg border border-neutral-800 bg-neutral-800/30"
          >
            <Icon name="package" size={16} className="text-neutral-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-neutral-200 truncate">{pkg.name}</span>
                <span className="text-[10px] text-neutral-600">{pkg.version}</span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-0.5">{pkg.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
