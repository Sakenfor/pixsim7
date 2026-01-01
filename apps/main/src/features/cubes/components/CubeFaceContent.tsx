/**
 * Cube Face Content
 *
 * Provides contextual face content for different cube types.
 */

import type { ReactNode } from 'react';
import type { CubeType, CubeFaceContentMap } from '../useCubeStore';
import { Icon } from '@lib/icons';

/**
 * Get face content for a cube based on its type
 */
export function getCubeFaceContent(type: CubeType): CubeFaceContentMap {
  switch (type) {
    case 'control':
      return {
        front: <FaceIcon icon="zap" label="Quick" color="blue" />,
        back: <FaceIcon icon="gamepad" label="Control" color="purple" />,
        left: <FaceIcon icon="palette" label="Style" color="indigo" />,
        right: <FaceIcon icon="barChart" label="Stats" color="cyan" />,
        top: <FaceIcon icon="settings" label="Settings" color="violet" />,
        bottom: <FaceIcon icon="search" label="Search" color="blue" />,
      };

    case 'provider':
      return {
        front: <FaceIcon icon="globe" label="Provider" color="green" />,
        back: <FaceIcon icon="radio" label="Connect" color="teal" />,
        left: <FaceIcon icon="plug" label="Plugin" color="emerald" />,
        right: <FaceIcon icon="settings" label="Config" color="lime" />,
        top: <FaceIcon icon="sparkles" label="Status" color="green" />,
        bottom: <FaceIcon icon="barChart" label="Usage" color="teal" />,
      };

    case 'preset':
      return {
        front: <FaceIcon icon="drama" label="Preset" color="orange" />,
        back: <FaceIcon icon="clipboardList" label="List" color="red" />,
        left: <FaceIcon icon="save" label="Save" color="amber" />,
        right: <FaceIcon icon="star" label="Favorite" color="yellow" />,
        top: <FaceIcon icon="palette" label="Create" color="orange" />,
        bottom: <FaceIcon icon="folder" label="Browse" color="red" />,
      };

    case 'panel':
      return {
        front: <FaceIcon icon="layoutGrid" label="Panel" color="cyan" />,
        back: <FaceIcon icon="sliders" label="Layout" color="indigo" />,
        left: <FaceIcon icon="layoutGrid" label="Tile" color="sky" />,
        right: <FaceIcon icon="barChart" label="Float" color="blue" />,
        top: <FaceIcon icon="sparkles" label="Max" color="cyan" />,
        bottom: <FaceIcon icon="zap" label="Close" color="indigo" />,
      };

    case 'settings':
      return {
        front: <FaceIcon icon="settings" label="Settings" color="gray" />,
        back: <FaceIcon icon="wrench" label="Tools" color="slate" />,
        left: <FaceIcon icon="sliders" label="Controls" color="zinc" />,
        right: <FaceIcon icon="fileText" label="Notes" color="neutral" />,
        top: <FaceIcon icon="key" label="Keys" color="gray" />,
        bottom: <FaceIcon icon="lightbulb" label="Help" color="slate" />,
      };

    case 'gallery':
      return {
        front: <FaceIcon icon="image" label="Gallery" color="pink" />,
        back: <FaceIcon icon="folder" label="Browse" color="rose" />,
        left: <FaceIcon icon="upload" label="Upload" color="fuchsia" />,
        right: <FaceIcon icon="download" label="Export" color="purple" />,
        top: <FaceIcon icon="sparkles" label="AI" color="pink" />,
        bottom: <FaceIcon icon="trash" label="Delete" color="rose" />,
      };

    case 'asset':
      return {
        front: <FaceIcon icon="image" label="Asset" color="amber" />,
        back: <FaceIcon icon="fileText" label="Info" color="yellow" />,
        left: <FaceIcon icon="copy" label="Copy" color="orange" />,
        right: <FaceIcon icon="share" label="Share" color="amber" />,
        top: <FaceIcon icon="star" label="Pin" color="yellow" />,
        bottom: <FaceIcon icon="trash" label="Remove" color="red" />,
      };

    case 'tool':
      return {
        front: <FaceIcon icon="wrench" label="Tool" color="slate" />,
        back: <FaceIcon icon="settings" label="Config" color="gray" />,
        left: <FaceIcon icon="zap" label="Run" color="blue" />,
        right: <FaceIcon icon="save" label="Save" color="green" />,
        top: <FaceIcon icon="info" label="Info" color="cyan" />,
        bottom: <FaceIcon icon="x" label="Close" color="red" />,
      };

    case 'custom':
    default:
      return {
        front: <FaceIcon icon="box" label="Custom" color="purple" />,
        back: <FaceIcon icon="settings" label="Config" color="indigo" />,
        left: <FaceIcon icon="palette" label="Style" color="violet" />,
        right: <FaceIcon icon="sliders" label="Options" color="fuchsia" />,
        top: <FaceIcon icon="sparkles" label="Action" color="purple" />,
        bottom: <FaceIcon icon="info" label="Info" color="indigo" />,
      };
  }
}

interface FaceIconProps {
  icon: string;
  label: string;
  color: string;
}

function FaceIcon({ icon, label, color }: FaceIconProps) {
  const colorClass = `text-${color}-300`;
  return (
    <div className={`${colorClass} flex flex-col items-center gap-1`}>
      <Icon name={icon as any} size={20} />
      <span className="text-xs">{label}</span>
    </div>
  );
}

/**
 * Get face content for a minimized panel cube
 */
export function getMinimizedPanelFaceContent(panelId: string): CubeFaceContentMap {
  return {
    front: (
      <div className="text-cyan-300 flex flex-col items-center gap-1">
        <Icon name="layoutGrid" size={20} />
        <span className="text-xs truncate max-w-[60px]">{panelId}</span>
      </div>
    ),
    back: <FaceIcon icon="maximize" label="Restore" color="green" />,
    left: <FaceIcon icon="move" label="Move" color="blue" />,
    right: <FaceIcon icon="x" label="Close" color="red" />,
    top: <FaceIcon icon="pin" label="Pin" color="amber" />,
    bottom: <FaceIcon icon="settings" label="Options" color="gray" />,
  };
}
