import { Button, FormField, Input, Select } from '@pixsim7/shared.ui';

import type { CharacterDetail } from '@lib/api/characters';

import { TemplateResolver } from '@features/prompts/components/shared/TemplateResolver';

const RENDER_STYLES = ['realistic', 'stylized', 'anime'];

export interface RenderingTabProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
}

export function RenderingTab({ character, onChange }: RenderingTabProps) {
  const images = character.reference_images ?? [];
  const characterId = character.character_id;

  const handleAddImage = () => {
    onChange({ reference_images: [...images, ''] });
  };

  const handleImageChange = (index: number, url: string) => {
    const updated = [...images];
    updated[index] = url;
    onChange({ reference_images: updated });
  };

  const handleRemoveImage = (index: number) => {
    onChange({ reference_images: images.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <FormField label="Render Style">
        <Select
          size="sm"
          value={character.render_style ?? 'realistic'}
          onChange={(e) => onChange({ render_style: e.target.value })}
        >
          {RENDER_STYLES.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </Select>
      </FormField>

      {/* Template resolver — live preview of species template expansion */}
      {characterId && (
        <TemplateResolver
          context={{ character_id: characterId }}
          initialProse={character.render_instructions ?? ''}
          onSave={(prose) => onChange({ render_instructions: prose })}
        />
      )}

      {/* Fallback: plain textarea when no character_id yet (create mode) */}
      {!characterId && (
        <FormField label="Render Instructions">
          <textarea
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
            rows={4}
            value={character.render_instructions ?? ''}
            onChange={(e) => onChange({ render_instructions: e.target.value })}
            placeholder="Realistic fur rendering. Maintain consistent lighting..."
          />
        </FormField>
      )}

      <FormField label="Reference Images">
        <p className="mb-1.5 text-xs text-neutral-500">
          For structured reference management (by kind, shot, view), use the References tab.
        </p>
        <div className="space-y-2">
          {images.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                size="sm"
                className="flex-1"
                value={url}
                onChange={(e) => handleImageChange(i, e.target.value)}
                placeholder="https://..."
              />
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleRemoveImage(i)}
                className="text-red-400 hover:text-red-300 shrink-0"
              >
                &times;
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="xs" onClick={handleAddImage}>
            + Add image URL
          </Button>
        </div>
      </FormField>
    </div>
  );
}
