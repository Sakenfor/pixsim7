/**
 * Phase 6: HUD Profile Switcher
 *
 * Allows players to quickly switch between different HUD profiles
 * (e.g., 'default', 'minimal', 'streamer', 'debug').
 */

import { useState, useEffect } from 'react';
import { Button, Select, Panel } from '@pixsim7/shared.ui';
import {
  getAvailableProfiles,
  getActiveProfileId,
  setActiveProfile,
  type HudProfile,
} from '../../lib/worldTools/hudProfiles';

interface HudProfileSwitcherProps {
  worldId: number;
  onProfileChange?: () => void;
  compact?: boolean;
}

/**
 * Profile switcher component
 */
export function HudProfileSwitcher({
  worldId,
  onProfileChange,
  compact = false,
}: HudProfileSwitcherProps) {
  const [profiles, setProfiles] = useState<HudProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('default');

  // Load profiles and active profile on mount
  useEffect(() => {
    setProfiles(getAvailableProfiles());
    setActiveProfileId(getActiveProfileId(worldId));
  }, [worldId]);

  const handleProfileChange = (newProfileId: string) => {
    setActiveProfile(worldId, newProfileId);
    setActiveProfileId(newProfileId);
    onProfileChange?.();
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  if (compact) {
    // Compact mode - just a dropdown
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-600 dark:text-neutral-400">Profile:</span>
        <Select
          size="sm"
          value={activeProfileId}
          onChange={(e) => handleProfileChange(e.target.value)}
          className="w-40"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.icon} {profile.name}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  // Full panel mode
  return (
    <Panel className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
        HUD Profile
      </h3>

      <div className="space-y-2">
        {profiles.map((profile) => {
          const isActive = profile.id === activeProfileId;
          return (
            <button
              key={profile.id}
              onClick={() => handleProfileChange(profile.id)}
              className={`
                w-full p-3 rounded border text-left transition-all
                ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-sm'
                    : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
                }
              `}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{profile.icon}</span>
                <div className="flex-1">
                  <div className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
                    {profile.name}
                    {isActive && (
                      <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                        (Active)
                      </span>
                    )}
                  </div>
                  {profile.description && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                      {profile.description}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {activeProfile && (
        <div className="pt-2 border-t border-neutral-300 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-400">
          Current profile: <strong>{activeProfile.name}</strong>
        </div>
      )}
    </Panel>
  );
}

/**
 * Floating profile switcher button
 */
export function HudProfileSwitcherButton({
  worldId,
  onProfileChange,
}: Omit<HudProfileSwitcherProps, 'compact'>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string>('default');
  const [profiles, setProfiles] = useState<HudProfile[]>([]);

  useEffect(() => {
    setProfiles(getAvailableProfiles());
    setActiveProfileId(getActiveProfileId(worldId));
  }, [worldId]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const handleChange = () => {
    setActiveProfileId(getActiveProfileId(worldId));
    onProfileChange?.();
  };

  if (!isOpen) {
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-40"
        title={`HUD Profile: ${activeProfile?.name || 'Default'}`}
      >
        {activeProfile?.icon || '📋'} {activeProfile?.name || 'Profile'}
      </Button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 w-72">
      <div className="relative">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsOpen(false)}
          className="absolute top-2 right-2 z-10"
        >
          ✕
        </Button>
        <HudProfileSwitcher
          worldId={worldId}
          onProfileChange={handleChange}
        />
      </div>
    </div>
  );
}
