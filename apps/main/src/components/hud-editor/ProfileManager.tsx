/**
 * Profile Manager Component
 *
 * Allows selection of HUD profiles for layout editing
 * (default, minimal, streamer, etc.)
 */

import { Select } from '@pixsim7/shared.ui';
import type { HudProfile } from '../../lib/worldTools/hudProfiles';

interface ProfileManagerProps {
  selectedProfile: string;
  availableProfiles: HudProfile[];
  onProfileChange: (profileId: string) => void;
  disabled?: boolean;
}

export function ProfileManager({
  selectedProfile,
  availableProfiles,
  onProfileChange,
  disabled = false,
}: ProfileManagerProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        HUD Profile
      </label>
      <Select
        value={selectedProfile}
        onChange={(e) => onProfileChange(e.target.value)}
        className="w-full"
        disabled={disabled}
      >
        {availableProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.icon} {profile.name}
          </option>
        ))}
      </Select>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        Choose which profile's layout to edit
      </p>
    </div>
  );
}
