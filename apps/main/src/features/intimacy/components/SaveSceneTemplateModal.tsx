/**
 * Save Scene Template Modal
 *
 * Modal dialog for saving an intimacy scene configuration as a reusable template.
 * Provides fields for template metadata (name, description, category, difficulty, tags)
 * and validates the scene before saving.
 *
 * Extracted from IntimacySceneComposer.tsx
 */

import React, { useMemo, useState } from 'react';

import type { IntimacySceneConfig } from '@lib/registries';

import { saveSceneAsTemplate, type SceneTemplate } from '../lib/templates';
import { validateSceneForTemplate } from '@pixsim7/game.engine';

export interface SaveSceneTemplateModalProps {
  scene: IntimacySceneConfig;
  onClose: () => void;
}

export function SaveSceneTemplateModal({ scene, onClose }: SaveSceneTemplateModalProps) {
  const [name, setName] = useState(scene.name || '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SceneTemplate['category']>('custom');
  const [difficulty, setDifficulty] = useState<SceneTemplate['difficulty']>('medium');
  const [tags, setTags] = useState<string>('');
  const validationResult = useMemo(() => validateSceneForTemplate(scene), [scene]);

  const handleSave = () => {
    if (!name.trim()) {
      alert('Please enter a template name');
      return;
    }

    if (!validationResult.valid) {
      const proceed = confirm(
        `This scene has validation errors:\n${validationResult.errors.join('\n')}\n\nSave anyway?`
      );
      if (!proceed) return;
    }

    try {
      saveSceneAsTemplate(scene, {
        name: name.trim(),
        description: description.trim(),
        category,
        difficulty,
        tags: tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0),
      });

      alert('Template saved successfully!');
      onClose();
    } catch (error) {
      alert(`Failed to save template: ${error}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              Save as Template
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-xl"
            >
              ✕
            </button>
          </div>

          {/* Validation Status */}
          {!validationResult.valid && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
              <div className="text-sm font-medium text-red-900 dark:text-red-300 mb-1">
                Validation Errors ({validationResult.errors.length})
              </div>
              <ul className="text-sm text-red-800 dark:text-red-400 list-disc list-inside">
                {validationResult.errors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {validationResult.warnings.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
              <div className="text-sm font-medium text-yellow-900 dark:text-yellow-300 mb-1">
                Warnings ({validationResult.warnings.length})
              </div>
              <ul className="text-sm text-yellow-800 dark:text-yellow-400 list-disc list-inside">
                {validationResult.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Template Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                placeholder="e.g., First Kiss Scene"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                placeholder="Describe what this template is for..."
              />
            </div>

            {/* Category & Difficulty */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SceneTemplate['category'])}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                >
                  <option value="flirt">Flirt</option>
                  <option value="date">Date</option>
                  <option value="kiss">Kiss</option>
                  <option value="intimate">Intimate</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as SceneTemplate['difficulty'])}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                placeholder="e.g., romantic, beginner, high-trust"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600"
            >
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
