/**
 * CUE Pack authoring method registration.
 *
 * Side-effect import: registers itself into the method registry on
 * module load. The Block Authoring panel imports this once at the
 * top of its barrel.
 */

import { registerAuthoringMethod } from '../registry';

import { CuePackEditor } from './CuePackEditor';

registerAuthoringMethod({
  id: 'cue-pack',
  label: 'CUE Pack',
  description:
    'Author user-owned block packs in CUE. Drafts compile in-memory through the prompt-pack API; publish creates an immutable version.',
  icon: 'package',
  order: 10,
  Editor: CuePackEditor,
});

export { CuePackEditor };
