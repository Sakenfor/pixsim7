import { definePanel } from '../../../lib/definePanel';

import { BlockMatrixPanel } from './BlockMatrixPanel';

export { BlockMatrixPanel };
export { BlockMatrixView } from './BlockMatrixView';
export type { BlockMatrixViewProps } from './BlockMatrixView';
export {
  DEFAULT_BLOCK_MATRIX_PRESETS,
  mergeBlockMatrixPresets,
  readTemplateMatrixPresets,
} from './presets';
export type { BlockMatrixPreset } from './presets';

export default definePanel({
  id: 'block-matrix',
  title: 'Block Matrix',
  component: BlockMatrixPanel,
  category: 'prompts',
  tags: ['blocks', 'prompts', 'content-packs', 'matrix', 'coverage', 'analysis'],
  icon: 'barChart',
  description: 'Explore prompt block coverage with 2D matrix views',
  supportsCompactMode: false,
  supportsMultipleInstances: true,
});
