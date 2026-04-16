import { describe, expect, it } from 'vitest';

import testOverviewPanel from '@features/panels/domain/definitions/test-overview';

describe('test-overview panel (dev-tool auto-registration)', () => {
  it('registers the test overview panel metadata for dev-tool auto-register', () => {
    expect(testOverviewPanel.id).toBe('test-overview');
    expect(testOverviewPanel.title).toBe('Test Overview');
    expect(testOverviewPanel.category).toBe('dev');
    expect(testOverviewPanel.tags).toContain('tests');

    const devTool = (testOverviewPanel as { metadata?: { devTool?: { category?: string; safeForNonDev?: boolean } } })
      .metadata?.devTool;
    expect(devTool?.category).toBe('debug');
    expect(devTool?.safeForNonDev).toBe(true);
  });

  it('exposes a panel component for rendering in dev tool host', () => {
    expect(testOverviewPanel.component).toBeDefined();
  });
});
