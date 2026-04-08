import { updateCharacter } from '@lib/api/characters';

import {
  useCapability,
  CAP_CHARACTER_CONTEXT,
  type CharacterContextSummary,
} from '@features/contextHub';
import { TemplateResolver } from '@features/prompts/components/shared/TemplateResolver';


export default function TemplateResolverPanelWrapper() {
  const { value: characterCtx } =
    useCapability<CharacterContextSummary>(CAP_CHARACTER_CONTEXT);

  if (!characterCtx?.characterId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-neutral-500">
        Select a character to see template resolution
      </div>
    );
  }

  const handleSave = async (prose: string) => {
    await updateCharacter(characterCtx.characterId, {
      render_instructions: prose,
    });
  };

  return (
    <div className="p-3 overflow-auto h-full">
      <TemplateResolver
        context={{ character_id: characterCtx.characterId }}
        onSave={handleSave}
      />
    </div>
  );
}
