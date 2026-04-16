import { PerformancePanel } from '@features/panels/components/dev/PerformancePanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'performance',
  title: 'Performance',
  component: PerformancePanel,
  category: 'dev',
  browsable: true,
  tags: ['performance', 'memory', 'fps', 'profiling', 'leaks', 'diagnostics', 'heap', 'dom'],
  icon: 'gauge',
  description: 'Monitor frontend performance — heap, FPS, long tasks, caches, store sizes',
  updatedAt: '2026-03-21T00:00:00Z',
  changeNote: 'Frontend performance dashboard — heap, FPS, DOM nodes, long tasks, blob caches, Zustand stores.',
  featureHighlights: [
    'JS heap sparkline and usage stats',
    'FPS counter with jank detection',
    'Long task observer (> 50ms)',
    'Blob URL cache utilization',
    'Zustand store size inventory',
  ],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug', safeForNonDev: true },
});
