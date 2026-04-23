/**
 * PerformancePanel - Frontend performance monitoring dashboard
 *
 * Tracks JS heap, DOM nodes, FPS, long tasks, blob caches, Zustand
 * store sizes, timers, and localStorage to surface memory leaks
 * and performance regressions.
 */

import {
  Badge,
  Button,
  SectionHeader,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  StatCard,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';
import { getCapturedFrameStoreStats } from '@lib/media/capturedFrameStore';
import { getVideoActivationPoolStats } from '@lib/media/videoActivationPool';
import { hmrSingleton } from '@lib/utils';

import {
  clearLocalFolderPreviewCache,
  getLocalFolderPreviewCacheStats,
} from '@features/assets/hooks/useLocalFoldersController';
import {
  getRegisteredInputStoreEntries,
  getRegisteredInputStores,
  getRegisteredSettingsStoreEntries,
} from '@features/generation/stores/generationScopeStores';


import { authMediaCaches, clearAuthMediaCaches } from '@/hooks/useAuthenticatedMedia';
import { clearThumbnailBlobCache, thumbnailBlobCache } from '@/hooks/useMediaThumbnail';

// ── Types ────────────────────────────────────────────────────────────────

interface HeapSnapshot {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface LongTaskScriptEntry {
  name: string;
  invoker: string;
  invokerType: string;
  sourceURL: string;
  sourceFunctionName: string;
  duration: number;
}

interface LongTaskEntry {
  id: number;
  name: string;
  duration: number;
  startTime: number;
  timestamp: number;
  /** LoAF script attribution (Chrome 123+) */
  scripts: LongTaskScriptEntry[];
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

interface LocalStorageEntry {
  key: string;
  size: number;
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

/** Enumerate localStorage keys with their sizes, sorted descending. */
function getLocalStorageEntries(): LocalStorageEntry[] {
  const entries: LocalStorageEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      entries.push({ key, size: (key.length + (value?.length ?? 0)) * 2 }); // UTF-16
    }
  } catch { /* access denied */ }
  return entries.sort((a, b) => b.size - a.size);
}

// ── Timer Tracker (monkey-patch) ─────────────────────────────────────────

interface TrackedTimer {
  id: number;
  type: 'interval' | 'timeout';
  createdAt: number;
  delay: number;
  callSite: string;
}

interface CallSiteStats {
  callSite: string;
  created: number;
  cleared: number;
  fired: number;
  active: number;
  /** Sum of delays (ms) for active timers — surfaces long-lived pins. */
  activeDelayTotal: number;
  /** Types seen at this call site. */
  types: Set<'interval' | 'timeout'>;
}

interface TimerTracker {
  active: Map<number, TrackedTimer>;
  totalCreated: number;
  totalCleared: number;
  /** Per call-site lifetime stats (survives timer clear/fire). */
  bySite: Map<string, CallSiteStats>;
}

/**
 * Walk the stack and pick the first frame that looks like app code.
 * Filters out vendor/node_modules/this-file frames so the surfaced site is
 * the actual caller that scheduled the timer.
 */
function captureCallSite(): string {
  const err = new Error();
  const stack = err.stack ?? '';
  const lines = stack.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.includes('PerformancePanel')) continue;
    if (line.includes('node_modules')) continue;
    if (line.includes('/@vite/')) continue;
    if (line.includes('/@react-refresh')) continue;
    if (line.includes('captureCallSite')) continue;
    // Shrink the frame: keep "at fn (path:line:col)" → "fn (path:line)".
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)$/)
      ?? line.match(/at\s+(.+?):(\d+):\d+$/);
    if (match) {
      if (match.length === 4) return `${match[1]} (${shortenPath(match[2])}:${match[3]})`;
      return `${shortenPath(match[1])}:${match[2]}`;
    }
    return line.slice(0, 200);
  }
  return '(unknown)';
}

function shortenPath(p: string): string {
  // Strip scheme + host, keep the last 3 path segments for readability.
  const pathPart = p.replace(/^https?:\/\/[^/]+/, '');
  const segments = pathPart.split('/').filter(Boolean);
  if (segments.length <= 3) return pathPart;
  return '.../' + segments.slice(-3).join('/');
}

function getOrCreateSiteStats(
  tracker: TimerTracker,
  callSite: string,
): CallSiteStats {
  let stats = tracker.bySite.get(callSite);
  if (!stats) {
    stats = {
      callSite,
      created: 0,
      cleared: 0,
      fired: 0,
      active: 0,
      activeDelayTotal: 0,
      types: new Set(),
    };
    tracker.bySite.set(callSite, stats);
  }
  return stats;
}

const timerTracker = hmrSingleton<TimerTracker>('perf-panel:timerTracker', () => {
  const tracker: TimerTracker = {
    active: new Map(),
    totalCreated: 0,
    totalCleared: 0,
    bySite: new Map(),
  };

  const origSetInterval = window.setInterval.bind(window);
  const origClearInterval = window.clearInterval.bind(window);
  const origSetTimeout = window.setTimeout.bind(window);
  const origClearTimeout = window.clearTimeout.bind(window);

  const onRemove = (numId: number, reason: 'cleared' | 'fired') => {
    const t = tracker.active.get(numId);
    if (!t) return;
    tracker.active.delete(numId);
    const stats = tracker.bySite.get(t.callSite);
    if (stats) {
      stats.active = Math.max(0, stats.active - 1);
      stats.activeDelayTotal = Math.max(0, stats.activeDelayTotal - t.delay);
      if (reason === 'cleared') stats.cleared++;
      else stats.fired++;
    }
  };

  window.setInterval = ((...args: Parameters<typeof setInterval>) => {
    const callSite = captureCallSite();
    const id = origSetInterval(...args);
    const numId = id as unknown as number;
    const delay = typeof args[1] === 'number' ? args[1] : 0;
    tracker.totalCreated++;
    tracker.active.set(numId, { id: numId, type: 'interval', createdAt: Date.now(), delay, callSite });
    const stats = getOrCreateSiteStats(tracker, callSite);
    stats.created++;
    stats.active++;
    stats.activeDelayTotal += delay;
    stats.types.add('interval');
    return id;
  }) as typeof setInterval;

  window.clearInterval = ((id?: number | ReturnType<typeof setInterval>) => {
    if (id != null) {
      onRemove(id as number, 'cleared');
      tracker.totalCleared++;
    }
    origClearInterval(id);
  }) as typeof clearInterval;

  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...rest: unknown[]) => {
    const callSite = captureCallSite();
    const delay = typeof timeout === 'number' ? timeout : 0;
    // Wrap handler so we auto-remove from active when it fires.
    const wrapped = (...callArgs: unknown[]) => {
      try {
        if (typeof handler === 'function') {
          return (handler as (...a: unknown[]) => unknown)(...callArgs);
        }
        // String handlers (rare): eval-style — just invoke original.
        return undefined;
      } finally {
        onRemove(numId, 'fired');
      }
    };
    const id = origSetTimeout(wrapped as TimerHandler, timeout, ...(rest as []));
    const numId = id as unknown as number;
    tracker.totalCreated++;
    tracker.active.set(numId, { id: numId, type: 'timeout', createdAt: Date.now(), delay, callSite });
    const stats = getOrCreateSiteStats(tracker, callSite);
    stats.created++;
    stats.active++;
    stats.activeDelayTotal += delay;
    stats.types.add('timeout');
    return id;
  }) as typeof setTimeout;

  window.clearTimeout = ((id?: number | ReturnType<typeof setTimeout>) => {
    if (id != null) {
      onRemove(id as number, 'cleared');
      tracker.totalCleared++;
    }
    origClearTimeout(id);
  }) as typeof clearTimeout;

  return tracker;
});

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

function extractScripts(entry: PerformanceEntry): LongTaskScriptEntry[] {
  const scripts = (entry as any).scripts;
  if (!Array.isArray(scripts)) return [];
  return scripts
    .filter((s: any) => s.duration > 0 || s.sourceFunctionName)
    .map((s: any) => ({
      name: s.name || '',
      invoker: s.invoker || '',
      invokerType: s.invokerType || '',
      sourceURL: s.sourceURL || '',
      sourceFunctionName: s.sourceFunctionName || '',
      duration: Math.round(s.duration ?? 0),
    }));
}

/** Short filename from a full URL, e.g. "generationScopeStores.ts" */
function shortSource(url: string): string {
  if (!url) return '';
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/');
    return segments[segments.length - 1] || pathname;
  } catch {
    return url.split('/').pop() || url;
  }
}

function useLongTasks(): LongTaskEntry[] {
  const [tasks, setTasks] = useState<LongTaskEntry[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;

    // Prefer Long Animation Frame API (Chrome 123+) for rich script attribution
    const useLoAF = PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame');

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const newTasks: LongTaskEntry[] = entries.map((entry) => ({
          id: ++idRef.current,
          name: entry.name,
          duration: Math.round(entry.duration),
          startTime: Math.round(entry.startTime),
          timestamp: Date.now(),
          scripts: extractScripts(entry),
        }));
        setTasks((prev) => [...newTasks, ...prev].slice(0, LONG_TASK_MAX_ENTRIES));
      });
      observer.observe({ type: useLoAF ? 'long-animation-frame' : 'longtask', buffered: true });
      return () => observer.disconnect();
    } catch {
      // observer type not supported in this browser
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
  const [thumbCache, setThumbCache] = useState({ entries: 0, bytes: 0 });
  const [authImageCache, setAuthImageCache] = useState({ entries: 0, bytes: 0 });
  const [authVideoCache, setAuthVideoCache] = useState({ entries: 0, bytes: 0 });
  const [localFolderCacheEntries, setLocalFolderCacheEntries] = useState(0);
  const [genScopeCount, setGenScopeCount] = useState(0);
  const [exposedStores, setExposedStores] = useState<StoreInfo[]>([]);
  const [localStorageEntries, setLocalStorageEntries] = useState<LocalStorageEntry[]>([]);
  const [activeTimerCount, setActiveTimerCount] = useState(0);
  const [activeIntervalCount, setActiveIntervalCount] = useState(0);

  // Heap baseline for diff
  const [heapBaseline, setHeapBaseline] = useState<number | null>(null);

  // Polling
  const pollMetrics = useCallback(() => {
    const h = getHeapSnapshot();
    setHeap(h);

    const dom = getDomNodeCount();
    setDomCount(dom);

    setThumbCache({ entries: thumbnailBlobCache.size, bytes: thumbnailBlobCache.totalBytes });
    setAuthImageCache({ entries: authMediaCaches.image.size, bytes: authMediaCaches.image.totalBytes });
    setAuthVideoCache({ entries: authMediaCaches.video.size, bytes: authMediaCaches.video.totalBytes });
    setLocalFolderCacheEntries(getLocalFolderPreviewCacheStats().entries);
    setGenScopeCount(getRegisteredInputStores().length);
    setExposedStores(getExposedStores());
    setLocalStorageEntries(getLocalStorageEntries());

    // Timer counts — split by type
    let intervals = 0;
    let timeouts = 0;
    for (const t of timerTracker.active.values()) {
      if (t.type === 'interval') intervals++;
      else timeouts++;
    }
    setActiveIntervalCount(intervals);
    setActiveTimerCount(timeouts);

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

  // ── Cache actions ──

  const [memoryReportCopied, setMemoryReportCopied] = useState(false);

  const handleClearAllCaches = useCallback(() => {
    clearThumbnailBlobCache();
    clearAuthMediaCaches();
    clearLocalFolderPreviewCache();
    pollMetrics();
  }, [pollMetrics]);

  const handleCopyMemoryReport = useCallback(async () => {
    const h = getHeapSnapshot();
    const lines: string[] = [];
    lines.push(`Memory report — ${new Date().toISOString()}`);
    lines.push('');
    if (h) {
      lines.push(`JS heap used:   ${formatBytes(h.usedJSHeapSize)}`);
      lines.push(`JS heap total:  ${formatBytes(h.totalJSHeapSize)}`);
      lines.push(`JS heap limit:  ${formatBytes(h.jsHeapSizeLimit)}`);
    } else {
      lines.push('JS heap:        (performance.memory not available)');
    }
    lines.push(`DOM nodes:      ${getDomNodeCount()}`);
    // Media element counts — concurrent <video> decoders are a common
    // source of native/GPU memory that JS can't see.
    const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
    const images = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
    const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
    let videosWithSrc = 0;
    let videosPlaying = 0;
    for (const v of videos) {
      if (v.currentSrc || v.src) videosWithSrc++;
      if (!v.paused && !v.ended && v.readyState > 2) videosPlaying++;
    }
    const scrubVideos = videos.filter((v) => v.dataset.showTimeline !== undefined);
    const scrubVideosWithSrc = scrubVideos.filter((v) => Boolean(v.currentSrc || v.src)).length;
    const scrubKeepPausedWithSrc = scrubVideos.filter(
      (v) => v.dataset.keepPaused === 'true' && Boolean(v.currentSrc || v.src),
    ).length;
    const scrubWaitingSlot = scrubVideos.filter(
      (v) => v.dataset.videoSlot === 'waiting',
    ).length;
    const videosWithCurrentSrcOnly = videos.filter(
      (v) => !v.getAttribute('src') && Boolean(v.currentSrc),
    ).length;
    let imagesWithSrc = 0;
    for (const i of images) {
      if (i.currentSrc || i.src) imagesWithSrc++;
    }
    const poolStats = getVideoActivationPoolStats();
    lines.push(`<video>:        ${videos.length} total, ${videosWithSrc} with src, ${videosPlaying} playing`);
    lines.push(`Video pool:     ${poolStats.active}/${poolStats.maxActive} active, ${poolStats.queued} queued`);
    lines.push(`Video scrub:    ${scrubVideos.length} widgets, ${scrubVideosWithSrc} with src, ${scrubKeepPausedWithSrc} keep-paused`);
    lines.push(`Scrub slots:    ${scrubWaitingSlot} waiting`);
    lines.push(`Video stale:    ${videosWithCurrentSrcOnly} with currentSrc only`);
    lines.push(`<img>:          ${images.length} total, ${imagesWithSrc} with src`);
    lines.push(`<canvas>:       ${canvases.length}`);
    lines.push('');

    // Per-<video> breakdown — decoded video frames live in GPU/native
    // memory, invisible to the JS heap. Each 4K decoder ≈ 200–800 MB.
    const videoRows = videos
      .map((v) => {
        const pixels = v.videoWidth * v.videoHeight;
        const src = v.currentSrc || v.src || '';
        const trimmedSrc = src.length > 60 ? '…' + src.slice(-58) : src;
        return {
          w: v.videoWidth,
          h: v.videoHeight,
          pixels,
          // Rough native budget: w×h×4 bytes × ~3 (decode pipeline + GPU upload)
          estBytes: pixels * 4 * 3,
          ready: v.readyState,
          paused: v.paused,
          src: trimmedSrc,
        };
      })
      .filter((r) => r.pixels > 0)
      .sort((a, b) => b.pixels - a.pixels);
    if (videoRows.length > 0) {
      const totalEst = videoRows.reduce((a, r) => a + r.estBytes, 0);
      lines.push(`Video decoders (est native): ${formatBytes(totalEst)} across ${videoRows.length}`);
      for (const r of videoRows.slice(0, 12)) {
        const tag = `${r.w}×${r.h}`.padEnd(10);
        const state = `rs${r.ready}${r.paused ? ' paused' : ' play  '}`;
        lines.push(`  ${tag} ${formatBytes(r.estBytes).padStart(10)}  ${state}  ${r.src}`);
      }
      lines.push('');
    }

    // Decoded <img> budget — browsers keep decoded RGBA bitmaps
    // separate from blob bytes (which is what the auth cache tracks).
    const imgRows = images
      .map((i) => ({
        w: i.naturalWidth,
        h: i.naturalHeight,
        pixels: i.naturalWidth * i.naturalHeight,
        estBytes: i.naturalWidth * i.naturalHeight * 4,
        src: (i.currentSrc || i.src || '').slice(0, 60),
      }))
      .filter((r) => r.pixels > 0)
      .sort((a, b) => b.pixels - a.pixels);
    if (imgRows.length > 0) {
      const totalDecoded = imgRows.reduce((a, r) => a + r.estBytes, 0);
      lines.push(`Image decode (est RGBA):     ${formatBytes(totalDecoded)} across ${imgRows.length}`);
      for (const r of imgRows.slice(0, 10)) {
        const tag = `${r.w}×${r.h}`.padEnd(12);
        lines.push(`  ${tag} ${formatBytes(r.estBytes).padStart(10)}  ${r.src}`);
      }
      lines.push('');
    }

    // Browser-level breakdown (Chrome: requires crossOriginIsolated).
    const perf = performance as unknown as {
      measureUserAgentSpecificMemory?: () => Promise<{
        bytes: number;
        breakdown: Array<{ bytes: number; attribution: unknown[]; types: string[] }>;
      }>;
    };
    if (typeof perf.measureUserAgentSpecificMemory === 'function') {
      try {
        const m = await perf.measureUserAgentSpecificMemory();
        lines.push(`UA memory total: ${formatBytes(m.bytes)}`);
        const groups: Record<string, number> = {};
        // type → attribution-key (url/scope) → bytes
        const byAttribution: Record<string, Record<string, number>> = {};
        for (const b of m.breakdown) {
          const key = (b.types && b.types.length > 0 ? b.types.join('+') : 'Unknown');
          groups[key] = (groups[key] || 0) + b.bytes;
          if (b.bytes <= 0) continue;
          const attrs = (b.attribution ?? []) as Array<{
            url?: string;
            scope?: string;
            container?: { id?: string; src?: string };
          }>;
          const attrKey = attrs.length === 0
            ? '(no attribution — likely shared)'
            : attrs
                .map((a) => a.url || a.scope || a.container?.src || a.container?.id || 'unknown')
                .join(' | ');
          if (!byAttribution[key]) byAttribution[key] = {};
          byAttribution[key][attrKey] = (byAttribution[key][attrKey] || 0) + b.bytes;
        }
        const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
        for (const [type, bytes] of sorted) {
          lines.push(`  ${type.padEnd(20)} ${formatBytes(bytes)}`);
          // Top 5 attribution sources for each type
          const attrs = byAttribution[type] ?? {};
          const topAttrs = Object.entries(attrs).sort((a, b) => b[1] - a[1]).slice(0, 5);
          for (const [aKey, aBytes] of topAttrs) {
            const trimmed = aKey.length > 70 ? '…' + aKey.slice(-68) : aKey;
            lines.push(`    ${formatBytes(aBytes).padStart(10)}  ${trimmed}`);
          }
        }
        lines.push('');
      } catch (e) {
        lines.push(`UA memory: unavailable (${(e as Error).message})`);
        lines.push('  (Requires crossOriginIsolated — needs COOP/COEP headers)');
        lines.push('');
      }
    } else {
      lines.push('UA memory: measureUserAgentSpecificMemory() not supported');
      lines.push('');
    }

    // Total origin storage (HTTP cache not included here, but Cache Storage + IDB + OPFS are).
    if (navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usage = est.usage ?? 0;
        const quota = est.quota ?? 0;
        lines.push(`Origin storage:  ${formatBytes(usage)} used / ${formatBytes(quota)} quota`);
        const details = (est as unknown as { usageDetails?: Record<string, number> }).usageDetails;
        if (details) {
          for (const [key, bytes] of Object.entries(details)) {
            lines.push(`  ${key.padEnd(20)} ${formatBytes(bytes)}`);
          }
        }
        lines.push('');
      } catch { /* ignore */ }
    }

    lines.push('Blob caches:');
    lines.push(`  Thumbnail:        ${thumbnailBlobCache.size}/${thumbnailBlobCache.maxEntries} entries, ${formatBytes(thumbnailBlobCache.totalBytes)}`);
    lines.push(`  Auth image:       ${authMediaCaches.image.size}/${authMediaCaches.image.maxEntries} entries, ${formatBytes(authMediaCaches.image.totalBytes)}`);
    lines.push(`  Auth video:       ${authMediaCaches.video.size}/${authMediaCaches.video.maxEntries} entries, ${formatBytes(authMediaCaches.video.totalBytes)}`);
    lines.push(`  Local folder:     ${getLocalFolderPreviewCacheStats().entries} entries (bytes unknown)`);
    const capturedFrames = getCapturedFrameStoreStats();
    lines.push(`  Captured frames:  ${capturedFrames.entries} entries, ${formatBytes(capturedFrames.bytes)} (dataURL chars)`);
    const cachesBytes =
      thumbnailBlobCache.totalBytes +
      authMediaCaches.image.totalBytes +
      authMediaCaches.video.totalBytes +
      capturedFrames.bytes;
    lines.push(`  Tracked total:    ${formatBytes(cachesBytes)}`);
    lines.push('');
    const stores = getExposedStores();
    lines.push(`Zustand stores (top 15 by size):`);
    for (const s of stores.slice(0, 15)) {
      lines.push(`  ${s.name.padEnd(30)} ${formatBytes(s.stateSize).padStart(10)}  (${s.keyCount} keys)`);
    }
    lines.push('');
    const ls = getLocalStorageEntries();
    const lsTotal = ls.reduce((a, e) => a + e.size, 0);
    lines.push(`localStorage:     ${ls.length} keys, ${formatBytes(lsTotal)} total`);
    lines.push(`Active timers:    ${timerTracker.active.size} (${timerTracker.totalCreated} created, ${timerTracker.totalCleared} cleared)`);

    // Per-scope generation store sizes — surfaces leaked scopes that
    // accumulate prompt/asset/settings state across long sessions.
    const inputEntries = getRegisteredInputStoreEntries();
    const settingsEntries = getRegisteredSettingsStoreEntries();
    lines.push(`Generation scopes: ${inputEntries.length} input / ${settingsEntries.length} settings`);
    const settingsByScope = new Map(settingsEntries.map((e) => [e.scopeId, e.store]));
    const readState = (hook: unknown): unknown => {
      const fn = (hook as { getState?: () => unknown })?.getState;
      return typeof fn === 'function' ? fn() : undefined;
    };
    const scopeRows = inputEntries.map((e) => {
      const inputSize = estimateObjectSize(readState(e.store));
      const settingsSize = estimateObjectSize(readState(settingsByScope.get(e.scopeId)));
      return {
        scopeId: e.scopeId,
        total: Math.max(0, inputSize) + Math.max(0, settingsSize),
        inputSize,
        settingsSize,
      };
    }).sort((a, b) => b.total - a.total);
    for (const r of scopeRows.slice(0, 10)) {
      lines.push(`  ${r.scopeId.padEnd(30)} ${formatBytes(r.total).padStart(10)}  (in:${formatBytes(r.inputSize)} set:${formatBytes(r.settingsSize)})`);
    }

    const report = lines.join('\n');
    try {
      await navigator.clipboard.writeText(report);
      setMemoryReportCopied(true);
      setTimeout(() => setMemoryReportCopied(false), 2000);
    } catch {
      console.log(report);
    }
  }, []);

  // ── Sidebar Navigation ──

  const sections = useMemo<SidebarContentLayoutSection[]>(
    () => [
      { id: 'overview', label: 'Overview', icon: <Icon name="activity" size={12} /> },
      { id: 'long-tasks', label: 'Long Tasks', icon: <Icon name="alertTriangle" size={12} /> },
      { id: 'caches', label: 'Blob Caches', icon: <Icon name="image" size={12} /> },
      { id: 'stores', label: 'Stores', icon: <Icon name="database" size={12} /> },
      { id: 'timers', label: 'Timers', icon: <Icon name="clock" size={12} /> },
      { id: 'storage', label: 'localStorage', icon: <Icon name="archive" size={12} /> },
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
        <SectionHeader
          trailing={
            heapSupported ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  if (heapBaseline !== null) {
                    setHeapBaseline(null);
                  } else {
                    setHeapBaseline(heap!.usedJSHeapSize);
                  }
                }}
              >
                {heapBaseline !== null ? 'Clear baseline' : 'Take baseline'}
              </Button>
            ) : undefined
          }
        >
          Memory
        </SectionHeader>
        {heapSupported ? (
          <>
            <div className={`grid gap-3 ${heapBaseline !== null ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <StatCard
                label="Used Heap"
                value={formatBytes(heap!.usedJSHeapSize)}
                sublabel={`${heapPct}% of limit`}
              />
              {heapBaseline !== null ? (
                <StatCard
                  label="Delta from baseline"
                  value={`${heap!.usedJSHeapSize >= heapBaseline ? '+' : ''}${formatBytes(heap!.usedJSHeapSize - heapBaseline)}`}
                  sublabel={
                    heap!.usedJSHeapSize > heapBaseline
                      ? 'Growth since baseline'
                      : 'Decreased since baseline'
                  }
                />
              ) : (
                <>
                  <StatCard
                    label="Total Heap"
                    value={formatBytes(heap!.totalJSHeapSize)}
                  />
                  <StatCard
                    label="Heap Limit"
                    value={formatBytes(heap!.jsHeapSizeLimit)}
                  />
                </>
              )}
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

  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  const renderLongTasks = () => (
    <div className="p-4 space-y-4">
      <SectionHeader>
        Long Tasks ({longTasks.length})
      </SectionHeader>
      <p className="text-xs text-neutral-500">
        Tasks taking &gt;50ms block the main thread and cause UI jank.
        {longTasks.length > 0 && longTasks[0].scripts.length > 0
          ? ' Click a task to see script attribution.'
          : longTasks.length > 0
            ? ' LoAF not available — upgrade Chrome for script attribution.'
            : ''
        }
      </p>
      {longTasks.length === 0 ? (
        <div className="text-sm text-neutral-500 py-8 text-center">
          No long tasks detected yet. Keep using the app — they will appear here.
        </div>
      ) : (
        <div className="space-y-1">
          {longTasks.map((task) => {
            const isExpanded = expandedTaskId === task.id;
            const hasScripts = task.scripts.length > 0;

            return (
              <div key={task.id}>
                <div
                  className={`flex items-center gap-3 text-xs py-1.5 px-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 ${hasScripts ? 'cursor-pointer' : ''}`}
                  onClick={hasScripts ? () => setExpandedTaskId(isExpanded ? null : task.id) : undefined}
                >
                  {hasScripts && (
                    <Icon
                      name="chevronRight"
                      size={10}
                      className={`text-neutral-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  )}
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
                  <span className="text-neutral-500 font-mono truncate">
                    {hasScripts
                      ? task.scripts
                          .slice(0, 2)
                          .map((s) => s.sourceFunctionName || s.invoker || shortSource(s.sourceURL))
                          .filter(Boolean)
                          .join(', ') || (task.name === 'self' ? 'main thread' : task.name)
                      : task.name === 'self' ? 'main thread' : task.name
                    }
                  </span>
                  {hasScripts && task.scripts.length > 2 && (
                    <span className="text-neutral-400">+{task.scripts.length - 2}</span>
                  )}
                  <span className="ml-auto text-neutral-400 whitespace-nowrap">
                    {new Date(task.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {isExpanded && (
                  <div className="ml-6 mt-1 mb-2 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3 space-y-1.5">
                    {task.scripts.map((script, i) => (
                      <div key={i} className="text-xs space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge color="blue">{script.duration}ms</Badge>
                          <span className="font-mono font-medium text-neutral-700 dark:text-neutral-300">
                            {script.sourceFunctionName || '(anonymous)'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 ml-1 text-neutral-500">
                          {script.invoker && (
                            <span>
                              <span className="text-neutral-400">invoker: </span>
                              <span className="font-mono">{script.invoker}</span>
                            </span>
                          )}
                          {script.invokerType && (
                            <span>
                              <span className="text-neutral-400">type: </span>
                              {script.invokerType}
                            </span>
                          )}
                          {script.sourceURL && (
                            <span className="font-mono truncate" title={script.sourceURL}>
                              <span className="text-neutral-400">source: </span>
                              {shortSource(script.sourceURL)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
          value={formatBytes(thumbCache.bytes)}
          sublabel={`${thumbCache.entries} / ${thumbnailBlobCache.maxEntries} entries${thumbnailBlobCache.maxBytes ? ` • cap ${formatBytes(thumbnailBlobCache.maxBytes)}` : ''}`}
        />
        <StatCard
          label="Auth Image Cache"
          value={formatBytes(authImageCache.bytes)}
          sublabel={`${authImageCache.entries} / ${authMediaCaches.image.maxEntries} entries${authMediaCaches.image.maxBytes ? ` • cap ${formatBytes(authMediaCaches.image.maxBytes)}` : ''}`}
        />
        <StatCard
          label="Auth Video Cache"
          value={formatBytes(authVideoCache.bytes)}
          sublabel={`${authVideoCache.entries} / ${authMediaCaches.video.maxEntries} entries${authMediaCaches.video.maxBytes ? ` • cap ${formatBytes(authMediaCaches.video.maxBytes)}` : ''}`}
        />
        <StatCard
          label="Local Folder Previews"
          value={`${localFolderCacheEntries}`}
          sublabel="entries (size unknown — from IndexedDB)"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={handleClearAllCaches}>
          Clear all blob caches
        </Button>
        <Button size="sm" variant="secondary" onClick={handleCopyMemoryReport}>
          {memoryReportCopied ? 'Copied!' : 'Copy memory report'}
        </Button>
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

  const renderTimers = () => {
    const intervals = Array.from(timerTracker.active.values())
      .filter((t) => t.type === 'interval')
      .sort((a, b) => a.createdAt - b.createdAt);

    // Call-site breakdown — sorted by active count, then lifetime creates.
    const sites = Array.from(timerTracker.bySite.values())
      .sort((a, b) => (b.active - a.active) || (b.created - a.created))
      .slice(0, 30);

    return (
      <div className="p-4 space-y-4">
        <SectionHeader>Active Timers</SectionHeader>
        <p className="text-xs text-neutral-500">
          Tracks <code>setInterval</code> / <code>setTimeout</code> via monkey-patch.
          Active intervals that grow without bound indicate cleanup misses in effects.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Active Intervals" value={activeIntervalCount} />
          <StatCard label="Active Timeouts" value={activeTimerCount} />
          <StatCard
            label="Total created / cleared"
            value={`${timerTracker.totalCreated} / ${timerTracker.totalCleared}`}
          />
        </div>

        {sites.length > 0 && (
          <>
            <SectionHeader>Top call sites</SectionHeader>
            <p className="text-xs text-neutral-500">
              Call sites that scheduled timers, ranked by active count then
              lifetime creates.  High <code>active</code> with low{' '}
              <code>fired + cleared</code> = likely leak.
            </p>
            <div className="border rounded-md overflow-hidden dark:border-neutral-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-800 border-b dark:border-neutral-700">
                    <th className="text-left py-1.5 px-3 font-medium text-neutral-500">Site</th>
                    <th className="text-right py-1.5 px-3 font-medium text-neutral-500">Active</th>
                    <th className="text-right py-1.5 px-3 font-medium text-neutral-500">Created</th>
                    <th className="text-right py-1.5 px-3 font-medium text-neutral-500">Cleared</th>
                    <th className="text-right py-1.5 px-3 font-medium text-neutral-500">Fired</th>
                    <th className="text-right py-1.5 px-3 font-medium text-neutral-500">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => (
                    <tr
                      key={s.callSite}
                      className="border-b dark:border-neutral-700 last:border-b-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    >
                      <td className="py-1.5 px-3 font-mono text-[10px] break-all">{s.callSite}</td>
                      <td className="py-1.5 px-3 text-right">
                        <span className={s.active > 50 ? 'text-red-500 font-medium' : s.active > 10 ? 'text-amber-500' : ''}>
                          {s.active}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-right text-neutral-500">{s.created}</td>
                      <td className="py-1.5 px-3 text-right text-neutral-500">{s.cleared}</td>
                      <td className="py-1.5 px-3 text-right text-neutral-500">{s.fired}</td>
                      <td className="py-1.5 px-3 text-right text-neutral-500">
                        {Array.from(s.types).join(',')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {intervals.length > 0 && (
          <>
            <SectionHeader>Active Intervals</SectionHeader>
            <div className="border rounded-md overflow-hidden dark:border-neutral-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-800 border-b dark:border-neutral-700">
                    <th className="text-left py-1.5 px-3 font-medium text-neutral-500">ID</th>
                    <th className="text-right py-1.5 px-3 font-medium text-neutral-500">Delay</th>
                    <th className="text-right py-1.5 px-3 font-medium text-neutral-500">Running for</th>
                  </tr>
                </thead>
                <tbody>
                  {intervals.map((t) => {
                    const age = Math.round((Date.now() - t.createdAt) / 1000);
                    return (
                      <tr
                        key={t.id}
                        className="border-b dark:border-neutral-700 last:border-b-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      >
                        <td className="py-1.5 px-3 font-mono">{t.id}</td>
                        <td className="py-1.5 px-3 text-right text-neutral-500">{t.delay}ms</td>
                        <td className="py-1.5 px-3 text-right">
                          <span className={age > 300 ? 'text-amber-500 font-medium' : ''}>
                            {age}s
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderStorage = () => {
    const totalSize = localStorageEntries.reduce((sum, e) => sum + e.size, 0);

    return (
      <div className="p-4 space-y-4">
        <SectionHeader>localStorage</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total keys" value={localStorageEntries.length} />
          <StatCard
            label="Total size"
            value={formatBytes(totalSize)}
            sublabel={totalSize > 4 * 1024 * 1024 ? 'Approaching 5 MB limit' : undefined}
          />
        </div>

        {localStorageEntries.length > 0 && (
          <div className="border rounded-md overflow-hidden dark:border-neutral-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800 border-b dark:border-neutral-700">
                  <th className="text-left py-1.5 px-3 font-medium text-neutral-500">Key</th>
                  <th className="text-right py-1.5 px-3 font-medium text-neutral-500">Size</th>
                </tr>
              </thead>
              <tbody>
                {localStorageEntries.map((entry) => (
                  <tr
                    key={entry.key}
                    className="border-b dark:border-neutral-700 last:border-b-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <td className="py-1.5 px-3 font-mono truncate max-w-[300px]" title={entry.key}>
                      {entry.key}
                    </td>
                    <td className="py-1.5 px-3 text-right whitespace-nowrap">
                      <span className={entry.size > 100_000 ? 'text-amber-500 font-medium' : ''}>
                        {formatBytes(entry.size)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

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
      case 'timers':
        return renderTimers();
      case 'storage':
        return renderStorage();
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
