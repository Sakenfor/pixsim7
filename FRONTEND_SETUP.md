# Frontend Setup Complete

## What Was Created

A bare-bones React + TypeScript + Vite frontend with modular architecture, ready for incremental feature development.

### Location
```
G:\code\pixsim7\frontend\
```

### Tech Stack
- **React 19** with TypeScript
- **Vite** for fast development
- **React Router** for routing
- **Zustand** for state management
- **Axios** for API calls

## Architecture Overview

### Modular Service Layer Pattern

The frontend uses a **Module Service Layer** architecture where each feature (gallery, scene-builder, etc.) is a self-contained module that:

1. Implements the `Module` interface
2. Registers itself with the `ModuleRegistry`
3. Exposes a service API for other modules
4. Manages its own internal state

This allows you to:
- Develop features independently
- Add new modules without touching existing code
- Have clear contracts between modules
- Test modules in isolation

### Project Structure

```
frontend/src/
├── lib/
│   ├── api/
│   │   └── client.ts              # API client with auth interceptors
│   └── auth/
│       └── authService.ts         # Login, register, logout
│
├── modules/
│   ├── types.ts                   # Module interface & registry
│   ├── index.ts                   # Module registration
│   ├── gallery/
│   │   └── index.ts              # Gallery module (placeholder)
│   └── scene-builder/
│       └── index.ts              # Scene builder module (placeholder)
│
├── routes/
│   ├── Login.tsx                  # Login page
│   ├── Register.tsx               # Registration page
│   ├── Home.tsx                   # Dashboard
│   └── ProtectedRoute.tsx         # Auth wrapper
│
├── stores/
│   └── authStore.ts               # Global auth state
│
├── types/
│   └── index.ts                   # Shared TypeScript types
│
├── App.tsx                        # Main app with routing
└── main.tsx                       # Entry point
```

## What's Included

### Working Features
- User registration and login
- JWT token management
- Protected routes
- Module registry system
- API client with automatic auth

### Placeholder Modules
- **Gallery Module** - Ready for implementation
- **Scene Builder Module** - Ready for implementation

Both modules are registered and initialized, but throw "not implemented" errors when methods are called.

## How to Run

### Start Backend First
```bash
# From pixsim7 root
.\start-backend.bat
```

Backend should be running at `http://localhost:8000`

### Start Frontend
```bash
# Option 1: From frontend directory
cd frontend
npm run dev

# Option 2: Use the batch file
cd frontend
start-frontend.bat
```

Frontend will be at `http://localhost:5173`

### Test the Setup
1. Visit `http://localhost:5173`
2. Click "Register" to create an account
3. Login with your credentials
4. You should see the home page with module status

## Next Steps - Adding Features

### Example: Implementing Gallery Module

1. **Create components in `frontend/src/modules/gallery/`**:
   ```
   modules/gallery/
   ├── index.ts              # Service API
   ├── GalleryView.tsx       # Main UI component
   ├── AssetCard.tsx         # Individual asset display
   └── useGallery.ts         # Custom hook for state
   ```

2. **Implement the service API in `index.ts`**:
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

     // ... other methods
   };
   ```

3. **Add route in `App.tsx`**:
   ```typescript
   <Route path="/gallery" element={
     <ProtectedRoute>
       <GalleryView />
     </ProtectedRoute>
   } />
   ```

4. **Use the module from other modules**:
   ```typescript
   import { galleryModule } from '../gallery';

   // In scene-builder
   const assets = await galleryModule.getAssets({ type: 'video' });
   ```

### Example: Implementing Scene Builder

Same pattern as gallery:
1. Create UI components
2. Implement service API methods
3. Add routes
4. Use gallery module for asset selection

## Module Communication Example

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

## Backend Integration

The frontend connects to these backend endpoints:

### Auth
- `POST /api/v1/auth/register` - Create user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/users/me` - Get current user

### Assets (to be used by gallery)
- `GET /api/v1/assets` - List assets
- `POST /api/v1/assets` - Upload asset
- `GET /api/v1/assets/{id}` - Get asset details

### Jobs (for video generation)
- `POST /api/v1/jobs` - Create generation job
- `GET /api/v1/jobs/{id}` - Get job status

### Scenes (to be used by scene-builder)
- Backend has Scene, SceneAsset, and SceneConnection models ready
- Endpoints need to be implemented in `pixsim7_backend/api/v1/scenes.py`

## Configuration

### Environment Variables
Edit `frontend/.env`:
```bash
VITE_API_URL=http://localhost:8000/api/v1
```

### Adding More Config
Update `frontend/.env` and access via:
```typescript
const someConfig = import.meta.env.VITE_YOUR_VAR;
```

## Build & Deploy

```bash
# Build for production
cd frontend
npm run build

# Preview production build
npm run preview

# Output is in frontend/dist/
```

## Key Design Decisions

1. **Module Service Layer** - Allows independent development of complex features
2. **Zustand for auth** - Lightweight, only used for global auth state
3. **Modules manage own state** - Each module can use React state, Zustand, or nothing
4. **Explicit service APIs** - Type-safe contracts between modules
5. **Placeholder modules** - Structure in place, implement incrementally

## Current Status

- ✅ Project scaffolding
- ✅ Auth system (login/register)
- ✅ API client with interceptors
- ✅ Module registry system
- ✅ Routing foundation
- ✅ Type definitions
- ⏳ Gallery module (placeholder)
- ⏳ Scene builder module (placeholder)
- ⏳ Playback module (not created yet)

## Resources

- Frontend README: `frontend/README.md`
- Backend API: `http://localhost:8000/docs`
- Module types: `frontend/src/modules/types.ts`
