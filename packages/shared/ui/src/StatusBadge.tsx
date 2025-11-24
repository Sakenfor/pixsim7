type SyncStatus = 'remote' | 'downloading' | 'downloaded' | 'error' | string;

const colorMap: Record<string, string> = {
  remote: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  downloading: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  downloaded: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

const labelMap: Record<string, string> = {
  remote: 'Remote',
  downloading: 'Downloading',
  downloaded: 'Downloaded',
  error: 'Error',
};

export function StatusBadge({ status, className = '' }: { status?: SyncStatus; className?: string }) {
  if (!status) return null;
  const key = (status || '').toLowerCase();
  const color = colorMap[key] || 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300';
  const label = labelMap[key] || status;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color} ${className}`}>
      {label}
    </span>
  );
}
