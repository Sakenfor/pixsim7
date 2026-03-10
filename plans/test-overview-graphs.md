# Test Overview Analytics Graphs

## What was added

### Service layer (`testAnalyticsAggregators.ts`)
Pure aggregator functions over `TestRunSnapshot[]`:
- `filterByWindow(snapshots, window, now?)` — filter by 7d/14d/30d/all
- `getRunStatusSeries(snapshots, window, profile?, now?)` — daily passed/failed/skipped counts
- `getPassRateByProfile(snapshots, window, now?)` — pass rate per profile, sorted by rate
- `getRunVolumeSeries(snapshots, window, profile?, now?)` — daily run volume
- `getInsightSummary(snapshots, window, now?)` — pass rate + delta vs previous period

### UI (`TestAnalyticsGraphs.tsx`)
Composite component added to Test Overview panel between execution output and profiles:
- **Controls**: time window toggle (7d/14d/30d/All) + profile filter dropdown
- **Run Status Trend**: stacked bar chart (passed/failed/skipped per day)
- **Pass Rate by Profile**: horizontal bar chart with color-coded thresholds
- **Insight line**: "Pass rate X% in last Nd — up/down Y% vs previous period"
- Hides entirely when no snapshots exist

### Tests (`testAnalyticsAggregators.test.ts`)
Covers: window filtering, profile filtering, pass-rate math, volume series, insight delta, empty-data behavior.

## Known limitations
- Profile-level snapshots only — no per-test granularity
- Charts are CSS-based (no canvas/SVG) — fine for ≤60 data points
- Insight comparison only works for time-bounded windows (not "all")
- No persistence of filter state across panel reopens
