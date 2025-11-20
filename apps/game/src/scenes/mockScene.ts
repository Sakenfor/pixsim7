import type { Scene } from '@pixsim7/shared.types'

export const mockScene: Scene = {
  id: 'demo-scene-1',
  title: 'Demo Interaction',
  startNodeId: 'intro',
  nodes: [
    {
      id: 'intro',
      type: 'video',
      label: 'Intro Loop',
      media: [
        { id: 'intro_a', url: 'https://cdn.example.com/intro_a.mp4', durationSec: 5, tags: ['idle'] },
        { id: 'intro_b', url: 'https://cdn.example.com/intro_b.mp4', durationSec: 6, tags: ['idle'] },
      ],
      selection: { kind: 'random' },
      playback: { kind: 'loopSegment' },
    },
    {
      id: 'kiss-build',
      type: 'video',
      label: 'Kiss Build',
      media: [
        { id: 'kb_approach_1', url: 'https://cdn.example.com/kb_approach_1.mp4', durationSec: 5, tags: ['approach'] },
        { id: 'kb_soft_1', url: 'https://cdn.example.com/kb_soft_1.mp4', durationSec: 6, tags: ['soft'] },
        { id: 'kb_passion_1', url: 'https://cdn.example.com/kb_passion_1.mp4', durationSec: 8, tags: ['passion'] },
      ],
      selection: { kind: 'pool', filterTags: ['approach', 'soft', 'passion'] },
      playback: {
        kind: 'progression',
        segments: [
          { label: 'Approach', segmentIds: ['kb_approach_1'] },
          { label: 'Soft Kiss', segmentIds: ['kb_soft_1'] },
          { label: 'Passion', segmentIds: ['kb_passion_1'] },
        ],
        miniGame: { id: 'reflex', config: { rounds: 3, windowMs: 900 } },
      },
    },
    {
      id: 'branch-success',
      type: 'video',
      label: 'Success Outcome',
      mediaUrl: 'https://example.com/success.mp4',
    },
    {
      id: 'branch-fail',
      type: 'video',
      label: 'Fail Outcome',
      mediaUrl: 'https://example.com/fail.mp4',
    },
  ],
  edges: [
    { id: 'e1', from: 'intro', to: 'kiss-build', label: 'Engage', effects: [{ key: 'engaged', op: 'flag' }] },
    { id: 'e2', from: 'kiss-build', to: 'branch-success', label: 'Hold Steady', conditions: [{ key: 'focus', op: 'gte', value: 3 }], effects: [{ key: 'affinity', op: 'inc', value: 2 }] },
    { id: 'e3', from: 'kiss-build', to: 'branch-fail', label: 'Break Away', effects: [{ key: 'affinity', op: 'dec', value: 1 }] },
    { id: 'e4', from: 'branch-fail', to: 'intro', label: 'Retry', effects: [{ key: 'focus', op: 'set', value: 0 }] },
  ],
}
