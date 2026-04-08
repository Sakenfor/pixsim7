/**
 * PromptAuthoringTemplateResolver
 *
 * Sub-panel: shows template resolver when a character is bound to the
 * selected prompt family via primary_character_id.
 * Editing saves to character.render_instructions.
 * Provides "Insert {{character:id}}" button for the prompt editor.
 */

import { Button } from '@pixsim7/shared.ui';
import { useCallback, useMemo } from 'react';


import { updateCharacter } from '@lib/api/characters';

import { usePromptAuthoring } from '../../context/PromptAuthoringContext';
import { TemplateResolver } from '../shared/TemplateResolver';


export function PromptAuthoringTemplateResolver() {
  const { selectedFamily, editorText, setEditorText } = usePromptAuthoring();

  const characterId = selectedFamily?.primary_character_id ?? null;

  const context = useMemo(
    () => (characterId ? { character_id: characterId } : null),
    [characterId],
  );

  const handleSave = useCallback(
    async (prose: string) => {
      if (!characterId) return;
      await updateCharacter(characterId, { render_instructions: prose });
    },
    [characterId],
  );

  const handleInsertRef = useCallback(() => {
    if (!characterId) return;
    const ref = `{{character:${characterId}}}`;
    // Append at cursor position or end
    setEditorText(editorText ? `${editorText} ${ref}` : ref);
  }, [characterId, editorText, setEditorText]);

  if (!context) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-neutral-500">
        No character bound to this family.
        <br />
        Set a primary character in the navigator to see template resolution.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">
          Character: <span className="text-neutral-200">{characterId}</span>
        </span>
        <Button variant="ghost" size="xs" onClick={handleInsertRef}>
          Insert {'{{'}character:{characterId}{'}}'}
        </Button>
      </div>

      <TemplateResolver
        context={context}
        onSave={handleSave}
      />
    </div>
  );
}
