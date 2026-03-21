/**
 * PerformancePanel - Frontend performance monitoring dashboard
 *
 * Tracks JS heap, DOM nodes, FPS, long tasks, blob caches, and Zustand
 * store sizes to surface memory leaks and performance regressions.
 */

import {
  Badge,
  SectionHeader,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  StatCard,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';
import { hmrSingleton } from '@lib/utils';

import { getRegisteredInputStores } from '@features/generation/stores/generationScopeStores';

// ── Types ────────────────────────────────────────────────────────────────

interface HeapSnapshot {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface LongTaskEntry {
  id: number;
  name: string;
  duration: number;
  startTime: number;
  timestamp: number;
}

interface TimeSeriesPoint {
  t: number;
  v: number;
}

interface StoreInfo {
  name: string;
  stateSize: number;
  keyCount: number;
}

// ── Constants ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const SPARKLINE_MAX_POINTS = 60; // 2 minutes at 2s intervals
const LONG_TASK_MAX_ENTRIES = 50;

// ── Helpers ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getHeapSnapshot(): HeapSnapshot | null {
  const perf = performance as any;
  if (!perf.memory) return null;
  return {
    usedJSHeapSize: perf.memory.usedJSHeapSize,
    totalJSHeapSize: perf.memory.totalJSHeapSize,
    jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
  };
}

function getDomNodeCount(): number {
  return document.querySelectorAll('*').length;
}

function estimateObjectSize(obj: unknown): number {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return -1;
  }
}

function countObjectKeys(obj: unknown): number {
  if (obj && typeof obj === 'object') return Object.keys(obj).length;
  return 0;
}

/** Access the blob cache Maps via the same hmrSingleton keys used by the hooks. */
function getThumbnailBlobCache(): Map<string, string> {
  return hmrSingleton('useMediaThumbnail:blobCache', () => new Map<string, string>());
}

function getAuthBlobCache(): Map<string, string> {
  return hmrSingleton('useAuthenticatedMedia:blobCache', () => new Map<string, string>());
}

/** Scan globalThis for Zustand stores exposed via exposeStoreForDebugging. */
function getExposedStores(): StoreInfo[] {
  const stores: StoreInfo[] = [];
  for (const key of Object.keys(globalThis)) {
    if (key.startsWith('__') && key.endsWith('Store')) {
      const store = (globalThis as any)[key];
      if (store && typeof store.getState === 'function') {
        const state = store.getState();
        stores.push({
          name: key.slice(2), // strip leading __
          stateSize: estimateObjectSize(state),
          keyCount: countObjectKeys(state),
        });
      }
    }
  }
  return stores.sort((a, b) => b.stateSize - a.stateSize);
}

// ── Sparkline Component ──────────────────────────────────────────────────

function Sparkline({
  data,
  width = 200,
  height = 40,
  color = '#3b82f6',
  label,
}: {
  data: TimeSeriesPoint[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}) {
  if (data.length < 2) return null;

  const values = data.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data
    .map((p, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((p.v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="relative">
      <svg width={width} height={height} className="block">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
      {label && (
        <span className="absolute bottom-0 right-0 text-[10px] text-neutral-400">
          {label}
        </span>
      )}
    </div>
  );
}

// ── FPS Hook ─────────────────────────────────────────────────────────────

function useFps(): number {
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const rafRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      frameCountRef.current++;
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;
      if (elapsed >= 1000) {
        setFps(Math.round((frameCountRef.current / elapsed) * 1000));
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return fps;
}

// ── Long Task Observer Hook ──────────────────────────────────────────────

function useLongTasks(): LongTaskEntry[] {
  const [tasks, setTasks] = useState<LongTaskEntry[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const newTasks: LongTaskEntry[] = entries.map((entry) => ({
          id: ++idRef.current,
          name: entry.name,
          duration: Math.round(entry.duration),
          startTime: Math.round(entry.startTime),
          timestamp: Date.now(),
        }));
        setTasks((prev) => [...newTasks, ...prev].slice(0, LONG_TASK_MAX_ENTRIES));
      });
      observer.observe({ type: 'longtask', buffered: true });
      return () => observer.disconnect();
    } catch {
      // longtask not supported in this browser
    }
  }, []);

  return tasks;
}

// ── Main Component ───────────────────────────────────────────────────────

export function PerformancePanel() {
  const { variant } = useTheme();
  const fps = useFps();
  const longTasks = useLongTasks();

  // Time series for sparklines
  const [heapHistory, setHeapHistory] = useState<TimeSeriesPoint[]>([]);
  const [domHistory, setDomHistory] = useState<TimeSeriesPoint[]>([]);
  const [fpsHistory, setFpsHistory] = useState<TimeSeriesPoint[]>([]);

  // Current snapshots
  const [heap, setHeap] = useState<HeapSnapshot | null>(null);
  const [domCount, setDomCount] = useState(0);
  const [thumbCacheSize, setThumbCacheSize] = useState(0);
  const [authCacheSize, setAuthCacheSize] = useState(0);
  const [genScopeCount, setGenScopeCount] = useState(0);
  const [exposedStores, setExposedStores] = useState<StoreInfo[]>([]);

  // Polling
  const pollMetrics = useCallback(() => {
    const h = getHeapSnapshot();
    setHeap(h);

    const dom = getDomNodeCount();
    setDomCount(dom);

    setThumbCacheSize(getThumbnailBlobCache().size);
    setAuthCacheSize(getAuthBlobCache().size);
    setGenScopeCount(getRegisteredInputStores().length);
    setExposedStores(getExposedStores());

    const now = Date.now();
    if (h) {
      setHeapHistory((prev) =>
        [...prev, { t: now, v: h.usedJSHeapSize }].slice(-SPARKLINE_MAX_POINTS),
      );
    }
    setDomHistory((prev) => [...prev, { t: now, v: dom }].slice(-SPARKLINE_MAX_POINTS));
  }, []);

  // Record FPS into history on a slower cadence
  useEffect(() => {
    if (fps > 0) {
      setFpsHistory((prev) =>
        [...prev, { t: Date.now(), v: fps }].slice(-SPARKLINE_MAX_POINTS),
      );
    }
  }, [fps]);

  useEffect(() => {
    pollMetrics();
    const id = setInterval(pollMetrics, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollMetrics]);

  // ── Sidebar Navigation ──

  const sections = useMemo<SidebarContentLayoutSection[]>(
    () => [
      { id: 'overview', label: 'Overview', icon: <Icon name="activity" size={12} /> },
      { id: 'long-tasks', label: 'Long Tasks', icon: <Icon name="alertTriangle" size={12} /> },
      { id: 'caches', label: 'Blob Caches', icon: <Icon name="image" size={12} /> },
      { id: 'stores', label: 'Stores', icon: <Icon name="database" size={12} /> },
    ],
    [],
  );

  const nav = useSidebarNav({
    sections,
    initial: 'overview',
    storageKey: 'performance-panel:nav',
  });

  // ── Section Renderers ──

  const renderOverview = () => {
    const heapSupported = heap !== null;
    const heapPct = heap ? ((heap.usedJSHeapSize / heap.jsHeapSizeLimit) * 100).toFixed(1) : '—';

    return (
      <div className="p-4 space-y-6">
        <SectionHeader>Memory</SectionHeader>
        {heapSupported ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Used Heap"
                value={formatBytes(heap!.usedJSHeapSize)}
                sublabel={`${heapPct}% of limit`}
              />
              <StatCard
                label="Total Heap"
                value={formatBytes(heap!.totalJSHeapSize)}
              />
              <StatCard
                label="Heap Limit"
                value={formatBytes(heap!.jsHeapSizeLimit)}
              />
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Heap usage (2 min)</div>
              <Sparkline data={heapHistory} width={400} height={48} color="#3b82f6" />
            </div>
          </>
        ) : (
          <div className="text-sm text-neutral-500">
            <code>performance.memory</code> not available (Chrome-only API).
            Launch Chrome with <code>--enable-precise-memory-info</code> for heap data.
          </div>
        )}

        <SectionHeader>DOM</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="DOM Nodes"
            value={domCount.toLocaleString()}
            sublabel={domCount > 10_000 ? 'High — may impact rendering' : undefined}
          />
          <StatCard
            label="FPS"
            value={fps}
            sublabel={fps < 30 ? 'Low — check for jank' : fps < 55 ? 'Fair' : 'Good'}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-neutral-500 mb-1">DOM nodes (2 min)</div>
            <Sparkline data={domHistory} width={200} height={40} color="#f59e0b" />
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">FPS (2 min)</div>
            <Sparkline data={fpsHistory} width={200} height={40} color="#10b981" />
          </div>
        </div>

        <SectionHeader>Long Tasks</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Long Tasks (session)"
            value={longTasks.length}
            sublabel="> 50ms tasks detected"
          />
          {longTasks.length > 0 && (
            <StatCard
              label="Worst"
              value={`${Math.max(...longTasks.map((t) => t.duration))}ms`}
              sublabel={longTasks.length > 10 ? 'Frequent — investigate' : undefined}
            />
          )}
        </div>
      </div>
    );
  };

  const renderLongTasks = () => (
    <div className="p-4 space-y-4">
      <SectionHeader>
        Long Tasks ({longTasks.length})
      </SectionHeader>
      <p className="text-xs text-neutral-500">
        Tasks taking &gt;50ms block the main thread and cause UI jank.
      </p>
      {longTasks.length === 0 ? (
        <div className="text-sm text-neutral-500 py-8 text-center">
          No long tasks detected yet. Keep using the app — they will appear here.
        </div>
      ) : (
        <div className="space-y-1">
          {longTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 text-xs py-1.5 px-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <Badge
                color={
                  task.duration > 200
                    ? 'red'
                    : task.duration > 100
                      ? 'orange'
                      : 'gray'
                }
              >
                {task.duration}ms
              </Badge>
              <span className="text-neutral-500 font-mono">
                {task.name === 'self' ? 'main thread' : task.name}
              </span>
              <span className="ml-auto text-neutral-400">
                {new Date(task.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderCaches = () => (
    <div className="p-4 space-y-4">
      <SectionHeader>Blob URL Caches</SectionHeader>
      <p className="text-xs text-neutral-500">
        Module-level LRU caches that keep blob URLs alive across virtualized
        component mount/unmount cycles. Revocation happens on eviction.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Thumbnail Cache"
          value={`${thumbCacheSize} / 200`}
          sublabel={thumbCacheSize >= 200 ? 'At capacity — LRU evicting' : `${((thumbCacheSize / 200) * 100).toFixed(0)}% full`}
        />
        <StatCard
          label="Auth Media Cache"
          value={`${authCacheSize} / 100`}
          sublabel={authCacheSize >= 100 ? 'At capacity — LRU evicting' : `${((authCacheSize / 100) * 100).toFixed(0)}% full`}
        />
      </div>

      <SectionHeader>Generation Scopes</SectionHeader>
      <StatCard
        label="Active Scopes"
        value={genScopeCount}
        sublabel="Registered generation input stores"
      />
    </div>
  );

  const renderStores = () => (
    <div className="p-4 space-y-4">
      <SectionHeader>
        Exposed Zustand Stores ({exposedStores.length})
      </SectionHeader>
      <p className="text-xs text-neutral-500">
        Stores registered via <code>exposeStoreForDebugging</code> on <code>window</code>.
        Sorted by serialized state size (descending).
      </p>
      {exposedStores.length === 0 ? (
        <div className="text-sm text-neutral-500 py-8 text-center">
          No stores exposed. Stores call <code>exposeStoreForDebugging()</code> to appear here.
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden dark:border-neutral-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800 border-b dark:border-neutral-700">
                <th className="text-left py-1.5 px-3 font-medium text-neutral-500">Store</th>
                <th className="text-right py-1.5 px-3 font-medium text-neutral-500">Keys</th>
                <th className="text-right py-1.5 px-3 font-medium text-neutral-500">State Size</th>
              </tr>
            </thead>
            <tbody>
              {exposedStores.map((store) => (
                <tr
                  key={store.name}
                  className="border-b dark:border-neutral-700 last:border-b-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                >
                  <td className="py-1.5 px-3 font-mono">{store.name}</td>
                  <td className="py-1.5 px-3 text-right text-neutral-500">{store.keyCount}</td>
                  <td className="py-1.5 px-3 text-right">
                    {store.stateSize < 0 ? (
                      <span className="text-neutral-400">circular</span>
                    ) : (
                      <span className={store.stateSize > 100_000 ? 'text-amber-500 font-medium' : ''}>
                        {formatBytes(store.stateSize)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Render ──

  const content = (() => {
    switch (nav.activeSectionId) {
      case 'overview':
        return renderOverview();
      case 'long-tasks':
        return renderLongTasks();
      case 'caches':
        return renderCaches();
      case 'stores':
        return renderStores();
      default:
        return renderOverview();
    }
  })();

  return (
    <SidebarContentLayout
      sections={sections}
      activeSectionId={nav.activeSectionId}
      onSelectSection={nav.selectSection}
      variant={variant}
      collapsible
      expandedWidth={160}
      persistKey="performance-panel-sidebar"
    >
      {content}
    </SidebarContentLayout>
  );
}
