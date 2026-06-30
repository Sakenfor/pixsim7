
/**
 * Similarity Badge Settings Schema
 *
 * Settings for the top-left similarity badges (Inputs / Prompt / Seed cohort
 * counts). Today: whether the cohort count + the mini-gallery it opens hide
 * high-confidence heuristic-broken siblings (faulty AI clips caught by the
 * audio/visual scoring), and at what score cutoff. A home for further
 * per-badge options as they land.
 *
 * Backed by `siblingFacetStore` (the badge's own backend-synced config), so the
 * adapter reads/writes there rather than the appearance store.
 */

import {
  COHORT_BROKEN_SCORE_MAX,
  COHORT_BROKEN_SCORE_MIN,
  useSiblingFacetStore,
} from '@/components/media/siblingFacetStore';

import { settingsSchemaRegistry, type SettingStoreAdapter, type SettingTab } from '../core';

function useSimilarityBadgeSettingsAdapter(): SettingStoreAdapter {
  const cohortHideBroken = useSiblingFacetStore((s) => s.cohortHideBroken);
  const setCohortHideBroken = useSiblingFacetStore((s) => s.setCohortHideBroken);
  const cohortBrokenScoreCutoff = useSiblingFacetStore((s) => s.cohortBrokenScoreCutoff);
  const setCohortBrokenScoreCutoff = useSiblingFacetStore((s) => s.setCohortBrokenScoreCutoff);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'cohortHideBroken') return cohortHideBroken;
      if (fieldId === 'cohortBrokenScoreCutoff') return cohortBrokenScoreCutoff;
      return undefined;
    },
    set: (fieldId: string, value: unknown) => {
      if (fieldId === 'cohortHideBroken') {
        setCohortHideBroken(Boolean(value));
        return;
      }
      if (fieldId === 'cohortBrokenScoreCutoff') {
        setCohortBrokenScoreCutoff(Number(value));
      }
    },
    getAll: () => ({ cohortHideBroken, cohortBrokenScoreCutoff }),
  };
}

const similarityBadgeTab: SettingTab = {
  id: 'similarity-badge',
  label: 'Similarity Badge',
  icon: 'link',
  groups: [
    {
      id: 'cohort-broken',
      title: 'Hide broken clips',
      description:
        'The cohort count and the mini-gallery it opens can skip clips the ' +
        'broken-video scoring flagged with high confidence, so a faulty AI ' +
        'generation never inflates a cohort or shows up when you open it. ' +
        'Clips you manually flagged broken are always hidden regardless.',
      fields: [
        {
          id: 'cohortHideBroken',
          type: 'toggle',
          label: 'Hide high-confidence broken siblings',
          description: 'Exclude scored-broken clips from the badge count and its gallery.',
          defaultValue: true,
        },
        {
          id: 'cohortBrokenScoreCutoff',
          type: 'range',
          label: 'Broken-score cutoff',
          description:
            'Minimum heuristic score (current scanner) to treat a sibling as ' +
            'broken. Higher = stricter, fewer dropped — these rarely misfire.',
          min: COHORT_BROKEN_SCORE_MIN,
          max: COHORT_BROKEN_SCORE_MAX,
          step: 1,
          defaultValue: 5,
          format: (v: number) => `≥ ${v}`,
          showWhen: (values) => values.cohortHideBroken !== false,
        },
      ],
    },
  ],
};

export function registerSimilarityBadgeSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'appearance',
    category: {
      label: 'Appearance',
      icon: 'palette',
      order: 15,
    },
    tab: similarityBadgeTab,
    useStore: useSimilarityBadgeSettingsAdapter,
  });
}
