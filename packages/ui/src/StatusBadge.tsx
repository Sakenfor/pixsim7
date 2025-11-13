type SyncStatus = 'remote' | 'downloading' | 'downloaded' | 'error' | string;

const colorMap: Record<string, string> = {
  remote: 'bg-blue-100 text-blue-700',
  downloading: 'bg-amber-100 text-amber-800',
  downloaded: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
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
  const color = colorMap[key] || 'bg-neutral-200 text-neutral-700';
  const label = labelMap[key] || status;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color} ${className}`}>
      {label}
    </span>
  );
}
