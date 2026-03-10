import { useMemo, useState } from 'react';

import {
  getPassRateByProfile,
  getRunStatusSeries,
  getRunVolumeSeries,
  type TestRunSnapshot,
  type TimeWindow,
} from '@features/devtools/services/testOverviewService';

const TIME_WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
];

interface ControlBarProps {
  window: TimeWindow;
  onWindowChange: (window: TimeWindow) => void;
  profileId: string;
  onProfileChange: (profileId: string) => void;
  profileOptions: { id: string; label: string }[];
}

function ControlBar({
  window,
  onWindowChange,
  profileId,
  onProfileChange,
  profileOptions,
}: ControlBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5">
        {TIME_WINDOWS.map((item) => (
          <button
            key={item.value}
            onClick={() => onWindowChange(item.value)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              window === item.value
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <select
        value={profileId}
        onChange={(event) => onProfileChange(event.target.value)}
        className="px-2.5 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300"
      >
        <option value="">All profiles</option>
        {profileOptions.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function RunStatusTrendChart({ series }: { series: ReturnType<typeof getRunStatusSeries> }) {
  if (series.length === 0) {
    return <EmptyState message="No run data for this window." />;
  }
  const maxTotal = Math.max(...series.map((point) => point.passed + point.failed + point.skipped), 1);

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
        Run status trend
      </h4>
      <div className="flex items-end gap-px" style={{ height: 120 }}>
        {series.map((point) => {
          const total = point.passed + point.failed + point.skipped;
          const heightPct = (total / maxTotal) * 100;
          const passedPct = total > 0 ? (point.passed / total) * 100 : 0;
          const failedPct = total > 0 ? (point.failed / total) * 100 : 0;
          const skippedPct = total > 0 ? (point.skipped / total) * 100 : 0;
          const shortDate = point.date.slice(5);
          return (
            <div
              key={point.date}
              className="flex-1 flex flex-col justify-end items-center group relative min-w-0"
              style={{ height: '100%' }}
            >
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 pointer-events-none">
                <div className="px-2 py-1 rounded text-[10px] bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 whitespace-nowrap shadow">
                  {point.date}: {point.passed}P / {point.failed}F / {point.skipped}S
                </div>
              </div>
              <div
                className="w-full rounded-t-sm overflow-hidden flex flex-col-reverse"
                style={{ height: `${heightPct}%`, minHeight: total > 0 ? 4 : 0 }}
              >
                {point.passed > 0 && (
                  <div className="bg-green-500 dark:bg-green-400" style={{ height: `${passedPct}%` }} />
                )}
                {point.failed > 0 && (
                  <div className="bg-red-500 dark:bg-red-400" style={{ height: `${failedPct}%` }} />
                )}
                {point.skipped > 0 && (
                  <div className="bg-amber-400 dark:bg-amber-300" style={{ height: `${skippedPct}%` }} />
                )}
              </div>
              {series.length <= 31 && (
                <span className="text-[9px] text-neutral-400 mt-1 truncate w-full text-center">{shortDate}</span>
              )}
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          { color: 'bg-green-500 dark:bg-green-400', label: 'Passed' },
          { color: 'bg-red-500 dark:bg-red-400', label: 'Failed' },
          { color: 'bg-amber-400 dark:bg-amber-300', label: 'Skipped' },
        ]}
      />
    </div>
  );
}

function PassRateByProfileChart({ rates }: { rates: ReturnType<typeof getPassRateByProfile> }) {
  if (rates.length === 0) {
    return <EmptyState message="No profile data for this window." />;
  }
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
        Pass rate by profile
      </h4>
      <div className="space-y-2">
        {rates.map((entry) => {
          const pct = Math.round(entry.rate * 100);
          const barColor =
            pct >= 80
              ? 'bg-green-500 dark:bg-green-400'
              : pct >= 50
                ? 'bg-amber-500 dark:bg-amber-400'
                : 'bg-red-500 dark:bg-red-400';
          return (
            <div key={entry.profileId} className="flex items-center gap-2">
              <span
                className="text-xs text-neutral-600 dark:text-neutral-400 w-28 truncate"
                title={entry.profileLabel}
              >
                {entry.profileLabel}
              </span>
              <div className="flex-1 h-4 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden relative">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-14 text-right tabular-nums">
                {pct}% <span className="text-neutral-400 text-[10px]">({entry.total})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RunVolumeByDayChart({ series }: { series: ReturnType<typeof getRunVolumeSeries> }) {
  if (series.length === 0) {
    return <EmptyState message="No run volume for this window." />;
  }
  const maxCount = Math.max(...series.map((point) => point.count), 1);

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
        Run volume by day
      </h4>
      <div className="flex items-end gap-1 h-24">
        {series.map((point) => (
          <div key={point.date} className="flex-1 flex flex-col items-center justify-end min-w-0">
            <div
              className="w-full rounded-sm bg-blue-500/80 dark:bg-blue-400/70"
              style={{ height: `${Math.max((point.count / maxCount) * 100, point.count > 0 ? 5 : 0)}%` }}
              title={`${point.date}: ${point.count} runs`}
            />
            {series.length <= 31 && (
              <span className="text-[9px] text-neutral-400 mt-1 truncate w-full text-center">
                {point.date.slice(5)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1">
          <span className={`inline-block w-2.5 h-2.5 rounded-sm ${item.color}`} />
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400 text-center">
      {message}
    </div>
  );
}

export interface TestAnalyticsGraphsProps {
  snapshots: TestRunSnapshot[];
}

export function TestAnalyticsGraphs({ snapshots }: TestAnalyticsGraphsProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('14d');
  const [profileId, setProfileId] = useState<string>('');

  const profileOptions = useMemo(() => {
    const labelById = new Map<string, string>();
    for (const snapshot of snapshots) {
      if (!labelById.has(snapshot.profileId)) {
        labelById.set(snapshot.profileId, snapshot.profileLabel || snapshot.profileId);
      }
    }
    return [...labelById.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [snapshots]);

  const analyticsOptions = useMemo(
    () => ({
      window: timeWindow,
      profileId: profileId || undefined,
    }),
    [timeWindow, profileId],
  );

  const statusSeries = useMemo(
    () => getRunStatusSeries(snapshots, analyticsOptions),
    [snapshots, analyticsOptions],
  );
  const passRates = useMemo(
    () => getPassRateByProfile(snapshots, analyticsOptions),
    [snapshots, analyticsOptions],
  );
  const runVolumeSeries = useMemo(
    () => getRunVolumeSeries(snapshots, analyticsOptions),
    [snapshots, analyticsOptions],
  );

  if (snapshots.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Analytics</h3>
        <ControlBar
          window={timeWindow}
          onWindowChange={setTimeWindow}
          profileId={profileId}
          onProfileChange={setProfileId}
          profileOptions={profileOptions}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <RunStatusTrendChart series={statusSeries} />
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <PassRateByProfileChart rates={passRates} />
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <RunVolumeByDayChart series={runVolumeSeries} />
        </div>
      </div>
    </section>
  );
}
