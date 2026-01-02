/**
 * Scene Character Viewer
 *
 * Shows all characters involved in a scene with their roles and relationships.
 */
import React, { useState, useEffect } from 'react';

interface SceneCharacterViewerProps {
  /** Scene ID */
  sceneId: number;
  /** API base URL */
  apiBaseUrl?: string;
}

interface CharacterInScene {
  characterId: string;
  characterName: string;
  role: string;
  required: boolean;
  roleMetadata?: Record<string, unknown>;
}

export const SceneCharacterViewer: React.FC<SceneCharacterViewerProps> = ({
  sceneId,
  apiBaseUrl = '/api/v1',
}) => {
  const [characters, setCharacters] = useState<CharacterInScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSceneCharacters = async () => {
      try {
        // TODO: Implement backend endpoint for scene characters
        // For now, this is a placeholder
        const url = `${apiBaseUrl}/game-scenes/${sceneId}/characters`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch scene characters');
        const data = await response.json();
        setCharacters(data.characters || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchSceneCharacters();
  }, [sceneId, apiBaseUrl]);

  if (loading) {
    return (
      <div className="scene-character-viewer loading">
        <div className="spinner" />
        <p>Loading scene characters...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="scene-character-viewer error">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="scene-character-viewer">
      <h3>Characters in Scene</h3>

      {characters.length === 0 ? (
        <p>No characters assigned to this scene.</p>
      ) : (
        <div className="character-roles-list">
          {characters.map((char) => (
            <div key={char.characterId} className="character-role-item">
              <div className="character-info">
                <span className="character-name">{char.characterName}</span>
                <span className="role-badge">{char.role}</span>
                {char.required && <span className="required-badge">Required</span>}
              </div>
              {char.roleMetadata && (
                <div className="role-metadata">
                  <pre>{JSON.stringify(char.roleMetadata, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SceneCharacterViewer;
