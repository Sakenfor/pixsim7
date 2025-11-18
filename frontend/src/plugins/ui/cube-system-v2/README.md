# 🎲 Cube System V2 Plugin

A revolutionary 3D cube-based control center plugin that can replace the traditional dock interface.

## Features

### 🎯 Purpose-Driven Design
- **Creation Cube** - Content generation with 6 contextual faces
- **Timeline Cube** - Timeline editing and playback controls
- **Assets Cube** - Asset management organized by type
- **Preview Cube** - Real-time preview and export options
- **History Cube** - Version control and analytics

### 🌟 Smart Workspaces
Pre-configured cube layouts for different workflows:
- **Create Mode** - Optimized for content generation
- **Edit Mode** - Timeline-focused with support tools
- **Review Mode** - Preview-centered with history access

### 🎨 Natural Interactions
- **Click** - Select cube
- **Rotate** - Access different faces
- **Drag** - Reposition cubes
- **Double-click** - Expand to full panel
- **Connect** - Link cubes for data flow

### ⚡ Performance
- Lazy-loaded 3D engine
- GPU-accelerated animations
- Smooth 60fps interactions
- Minimal memory footprint

## Installation

1. Navigate to `/plugins` in the app
2. Find "Cube Control Center V2" in the available plugins
3. Click "Install"
4. The plugin will replace your control center with the cube system

## Usage

### Basic Navigation
- **Hover bottom edge** - Reveal cube system
- **Mouse drag** - Rotate camera view
- **Scroll** - Zoom in/out
- **Click workspace button** - Switch modes

### Keyboard Shortcuts
- `Ctrl+Shift+C` - Toggle cube system
- `Ctrl+Shift+F` - Focus mode (hide inactive cubes)
- `Esc` - Close expanded cube

### Workspace Modes

**Create Mode** (Default)
```
[Creation Cube] ←→ [Assets] ←→ [Preview]
```
Best for: Quick generation, prompt iteration, testing outputs

**Edit Mode**
```
      [Timeline]
    /    |    \
[Assets] [Preview] [History]
```
Best for: Scene building, precise editing, composition

**Review Mode**
```
    [Preview]
       |
   [History]
       |
    [Assets]
```
Best for: Quality control, export, final review

## Configuration

Access settings via:
1. Click the ⚙️ icon in cube system
2. Or go to `/plugins` → Cube System V2 → Settings

### Available Settings
- **Auto-hide** - Hide when mouse leaves (default: on)
- **Show grid** - Display 3D grid helper (default: on)
- **Default workspace** - Starting layout (default: Create)
- **Animation speed** - Transition speed multiplier (default: 1x)

## Replacing the Control Center

This plugin can completely replace the traditional dock:

1. Install the plugin
2. Go to Settings → Control Center
3. Select "Cube System V2" as default
4. Traditional dock will be hidden

To revert:
1. Go to `/plugins`
2. Disable "Cube System V2"
3. Traditional dock returns

## Development

### Plugin Structure
```
cube-system-v2/
├── plugin.ts           # Plugin manifest and lifecycle
├── CubeSystemV2.tsx    # Main component
├── README.md           # This file
└── assets/             # Icons, textures (future)
```

### Dependencies
- `three` - 3D engine
- `@react-three/fiber` - React integration
- `@react-three/drei` - Helpers and utilities
- `@react-spring/three` - Smooth animations

### Extending
To add new cube types:
1. Define cube in `CubeSystemV2.tsx`
2. Add to workspace layouts
3. Implement face content
4. Register interaction handlers

## Troubleshooting

### Cubes not appearing
- Check browser console for errors
- Ensure WebGL is supported
- Try disabling other UI plugins

### Performance issues
- Reduce animation speed in settings
- Disable grid helper
- Close unnecessary floating panels

### Keyboard shortcuts not working
- Ensure no input is focused
- Check for conflicting browser extensions
- Try reloading the page

## Credits

Created by the PixSim7 team as a demonstration of the plugin system's capabilities.

## License

MIT - Same as PixSim7 project
