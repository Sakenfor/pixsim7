import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

export interface Shortcut {
  id: string;
  label: string;
  icon?: string;
  action: () => void;
}

export function ShortcutsModule() {
  const navigate = useNavigate();

  const shortcuts: Shortcut[] = [
    {
      id: 'assets',
      label: 'Open Gallery',
      icon: '🖼️',
      action: () => navigate('/assets'),
    },
    {
      id: 'workspace',
      label: 'Open Workspace',
      icon: '🎨',
      action: () => navigate('/workspace'),
    },
    {
      id: 'home',
      label: 'Go Home',
      icon: '🏠',
      action: () => navigate('/'),
    },
    {
      id: 'graph',
      label: 'Open Graph',
      icon: '🕸️',
      action: () => navigate('/graph/1'),
    },
  ];

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {shortcuts.map(shortcut => (
          <button
            key={shortcut.id}
            onClick={shortcut.action}
            className={clsx(
              'flex flex-col items-center justify-center gap-2 p-4 rounded-lg',
              'border border-neutral-200 dark:border-neutral-700',
              'bg-white dark:bg-neutral-900',
              'hover:bg-neutral-50 dark:hover:bg-neutral-800',
              'hover:border-blue-400 dark:hover:border-blue-600',
              'transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-blue-500'
            )}
            aria-label={shortcut.label}
          >
            {shortcut.icon && (
              <span className="text-2xl" role="img" aria-hidden="true">
                {shortcut.icon}
              </span>
            )}
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {shortcut.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
