/**
 * Compact inline badge showing live-poll status for a single account.
 * Shared between CompactAccountCard and AccountRow.
 */
export function LivePollBadge({
  polling,
  liveUpdatedAt,
}: {
  polling: boolean;
  liveUpdatedAt?: number | null;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px]">
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          polling ? 'bg-green-500 animate-pulse' : 'bg-blue-500'
        }`}
      />
      <span
        className={`font-medium ${
          polling
            ? 'text-green-600 dark:text-green-400'
            : 'text-blue-600 dark:text-blue-400'
        }`}
      >
        {polling ? 'LIVE' : 'POLLING'}
      </span>
      {liveUpdatedAt != null && (
        <span className="text-neutral-400 dark:text-neutral-500">
          · {Math.max(0, Math.round((Date.now() - liveUpdatedAt) / 1000))}s
        </span>
      )}
    </span>
  );
}
