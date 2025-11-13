# PixSim7 Frontend

React + TypeScript + Vite frontend for the PixSim7 interactive video platform.

## Quick Start

### Prerequisites
- Node.js 18+
- Backend running at `http://localhost:8001`

### Setup & Run
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or use the batch file (Windows)
start-frontend.bat
```

Visit `http://localhost:5173`

### Environment
Copy `.env.example` to `.env` and configure:
```
VITE_BACKEND_URL=http://localhost:8001
```

---

## Architecture Overview

This frontend follows a **Modular Service Layer** architecture designed for incremental development of complex features.

### Key Principles
1. **Each module implements the `Module` interface** - Clear contracts
2. **Modules register themselves** with the `ModuleRegistry`
3. **Modules expose service APIs** for other modules to consume
4. **Modules manage their own internal state** - Independence

### Benefits
- Develop features independently
- Add new modules without touching existing code
- Type-safe contracts between modules
- Test modules in isolation

---

## Directory Structure

```
src/
├── lib/                    # Core libraries
│   ├── api/
│   │   └── client.ts      # API client with auth interceptors
│   └── auth/
│       └── authService.ts # Login, register, logout
│
├── modules/               # Feature modules (loosely coupled)
│   ├── types.ts          # Module interface & registry
│   ├── index.ts          # Module registration
│   ├── gallery/
│   │   └── index.ts      # Gallery module (placeholder)
│   └── scene-builder/
│       └── index.ts      # Scene builder module (placeholder)
│
├── routes/               # Page components
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Home.tsx
│   └── ProtectedRoute.tsx
│
├── stores/               # Global state (Zustand)
│   └── authStore.ts     # Auth state only
│
├── types/                # Shared TypeScript types
│   └── index.ts
│
├── App.tsx               # Main app with routing
└── main.tsx             # Entry point
```

---

## Technology Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **React Router 7** - Routing
- **Zustand** - State management (auth only)
- **Axios** - HTTP client

---

## Module System

### Current Modules (Placeholders)

- **Gallery Module** - Media browsing, upload, selection
- **Scene Builder Module** - Interactive scene creation with branching

### Adding a New Module

1. **Create folder** in `src/modules/your-module/`
2. **Create `index.ts`** implementing the `Module` interface
3. **Register it** in `src/modules/index.ts`
4. **Export service API** for other modules

**Example module structure:**
```
modules/gallery/
├── index.ts              # Service API
├── GalleryView.tsx       # Main UI component
├── AssetCard.tsx         # Sub-components
└── useGallery.ts         # Custom hook for state
```

**Example module implementation:**
```typescript
// modules/your-module/index.ts
export interface YourModule extends Module {
  id: 'your-module';
  name: string;
  initialize: () => Promise<void>;
  // Your module's API
  doSomething: () => Promise<void>;
}

export const yourModule: YourModule = {
  id: 'your-module',
  name: 'Your Module',

  initialize: async () => {
    console.log('Initializing...');
  },

  doSomething: async () => {
    // Implementation
  }
};
```

**Register in `modules/index.ts`:**
```typescript
import { yourModule } from './your-module';

export const modules = [
  yourModule,
  galleryModule,
  sceneBuilderModule
];
```

**Add route in `App.tsx`:**
```typescript
<Route path="/your-feature" element={
  <ProtectedRoute>
    <YourView />
  </ProtectedRoute>
} />
```

### Module Communication Example

Modules can call each other's service APIs:

```typescript
// In scene-builder/index.ts
import { galleryModule } from '../gallery';

export const sceneBuilderModule: SceneBuilderModule = {
  // ...

  selectAssetForNode: async (nodeId: string) => {
    // Use gallery module's API
    const asset = await galleryModule.selectAsset();

    // Update scene node with selected asset
    updateNode(nodeId, { assetId: asset.id });
  }
};
```

---

## API Communication

### API Client (`src/lib/api/client.ts`)
- Axios-based wrapper with interceptors
- Automatic token attachment
- Automatic 401 handling (redirects to login)

### Auth Service (`src/lib/auth/authService.ts`)
- Login/register/logout
- Token management
- User state persistence

### Backend Endpoints

**Auth:**
- `POST /api/v1/auth/register` - Create user
- `POST /api/v1/auth/login` - Login (OAuth2 password flow with form data)
- `GET /api/v1/users/me` - Get current user

**Assets** (for gallery module):
- `GET /api/v1/assets` - List assets
- `POST /api/v1/assets` - Upload asset
- `GET /api/v1/assets/{id}` - Get asset details

**Jobs** (for video generation):
- `POST /api/v1/jobs` - Create generation job
- `GET /api/v1/jobs/{id}` - Get job status

**Scenes** (for scene-builder):
- Backend has Scene, SceneAsset, SceneConnection models ready
- Endpoints need implementation in `pixsim7_backend/api/v1/scenes.py`

JWT token is stored in `localStorage` and automatically attached to all requests.

---

## State Management

- **Global Auth State**: Zustand store (`src/stores/authStore.ts`)
- **Module State**: Each module manages its own state internally
  - Can use React state, Zustand, or nothing
  - Modules are independent

---

## Development Workflow

### Example: Implementing Gallery Module

1. **Create UI components** in `src/modules/gallery/`:
   ```
   modules/gallery/
   ├── index.ts              # Service API
   ├── GalleryView.tsx       # Main UI component
   ├── AssetCard.tsx         # Individual asset display
   └── useGallery.ts         # Custom hook for state
   ```

2. **Implement service API** in `index.ts`:
   ```typescript
   export const galleryModule: GalleryModule = {
     id: 'gallery',
     name: 'Gallery Module',

     initialize: async () => {
       // Setup code
     },

     getAssets: async (filters) => {
       const response = await apiClient.get('/assets', { params: filters });
       return response.data;
     },

     selectAsset: async () => {
       // Show selection modal
       // Return selected asset
     }
   };
   ```

3. **Add route** in `App.tsx`:
   ```typescript
   <Route path="/gallery" element={
     <ProtectedRoute>
       <GalleryView />
     </ProtectedRoute>
   } />
   ```

4. **Use from other modules**:
   ```typescript
   import { galleryModule } from '../gallery';

   const assets = await galleryModule.getAssets({ type: 'video' });
   ```

---

## Build & Deploy

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Output is in frontend/dist/
```

---

## Current Implementation Status

- ✅ Project scaffolding
- ✅ Auth system (login/register)
- ✅ API client with interceptors
- ✅ Module registry system
- ✅ Routing foundation
- ✅ Type definitions
- ✅ Protected routes
- ⏳ Gallery module (placeholder structure)
- ⏳ Scene builder module (placeholder structure)
- ⏳ Playback module (not created yet)

---

## Next Steps - Feature Roadmap

### 1. Gallery Module
- Asset browsing with filters
- File upload with progress
- Asset preview and metadata
- Asset selection for scene builder

### 2. Scene Builder Module
- Visual node editor
- Video playback nodes
- Choice/branching nodes
- Connection drawing
- Scene preview

### 3. Playback Module
- Interactive scene player
- Choice handling
- State management for paths
- Progress tracking

### 4. Additional Features
- Workspace management
- Collaboration tools
- Provider integration UI
- Real-time updates

---

## Design Decisions

1. **Module Service Layer** - Allows independent development of complex features
2. **Zustand for auth only** - Lightweight, minimal global state
3. **Modules manage own state** - Maximum flexibility per feature
4. **Explicit service APIs** - Type-safe contracts between modules
5. **Placeholder modules** - Structure in place, implement incrementally

---

## Resources

- Backend API docs: `http://localhost:8001/docs`
- Module types: `src/modules/types.ts`
- Backend README: `../pixsim7_backend/README.md`
