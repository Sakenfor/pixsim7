import { describe, expect, it } from 'vitest';

import { testOverviewTool } from './tools';

describe('testOverviewTool', () => {
  it('registers the test overview devtool metadata', () => {
    expect(testOverviewTool.id).toBe('test-overview');
    expect(testOverviewTool.label).toBe('Test Overview');
    expect(testOverviewTool.category).toBe('debug');
    expect(testOverviewTool.safeForNonDev).toBe(true);
    expect(testOverviewTool.tags).toContain('tests');
  });

  it('exposes a panel component for rendering in dev tool host', () => {
    expect(typeof testOverviewTool.panelComponent).toBe('object');
  });
});
