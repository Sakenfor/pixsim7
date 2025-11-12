# PixSim7 Frontend

React + TypeScript + Vite frontend for the PixSim7 interactive video platform.

## Architecture

This frontend follows a **modular service layer architecture** designed for incremental development of complex features.

### Directory Structure

```
src/
├── lib/                    # Core libraries
│   ├── api/               # API client and HTTP utilities
│   └── auth/              # Authentication service
├── modules/               # Feature modules (loosely coupled)
│   ├── types.ts          # Module registry and base interfaces
│   ├── gallery/          # Media gallery module (placeholder)
│   └── scene-builder/    # Scene creation module (placeholder)
├── routes/               # Page components
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Home.tsx
│   └── ProtectedRoute.tsx
├── stores/               # Global state (Zustand)
│   └── authStore.ts
├── types/                # Shared TypeScript types
│   └── index.ts
├── App.tsx               # Main app with routing
└── main.tsx             # Entry point
```

### Module System

The application uses a **Module Service Layer** pattern where:

1. **Each module implements the `Module` interface** defined in `src/modules/types.ts`
2. **Modules register themselves** in `src/modules/index.ts`
3. **Modules can expose service APIs** for other modules to consume
4. **Modules are initialized** on app startup via the `ModuleRegistry`

#### Current Modules (Placeholders)

- **Gallery Module** - Will handle media browsing, upload, and selection
- **Scene Builder Module** - Will handle interactive scene creation with branching paths

#### Adding a New Module

1. Create folder in `src/modules/your-module/`
2. Create `index.ts` implementing the `Module` interface
3. Register it in `src/modules/index.ts`
4. Export its service API for other modules to use

```typescript
// Example
export interface YourModule extends Module {
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

### API Communication

- **API Client**: `src/lib/api/client.ts`
  - Axios-based wrapper with interceptors
  - Automatic token attachment
  - Automatic 401 handling
- **Auth Service**: `src/lib/auth/authService.ts`
  - Login/register/logout
  - Token management
  - User state persistence

### State Management

- **Auth State**: Zustand store in `src/stores/authStore.ts`
- **Module State**: Each module manages its own state internally

## Development

### Prerequisites

- Node.js 18+
- Backend running at `http://localhost:8001`

### Setup

```bash
npm install
```

### Environment

Copy `.env.example` to `.env` and configure:

```
VITE_BACKEND_URL=http://localhost:8001
```

### Run Development Server

```bash
npm run dev
```

Or use the provided script:

```bash
# Windows
start-frontend.bat
```

Visit `http://localhost:5173` (or configured `VITE_ADMIN_PORT` if aligning with admin)

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Authentication

The app connects to the FastAPI backend's `/api/v1/auth` endpoints:

- `POST /auth/register` - Create new user
- `POST /auth/login` - Login (OAuth2 password flow with form data)
- `GET /users/me` - Get current user

JWT token is stored in `localStorage` and automatically attached to requests.

## Next Steps

This is a **bare-bones foundation**. Features to be implemented incrementally:

1. **Gallery Module**
   - Asset browsing with filters
   - File upload with progress
   - Asset preview and metadata
   - Asset selection for scene builder

2. **Scene Builder Module**
   - Visual node editor
   - Video playback nodes
   - Choice/branching nodes
   - Connection drawing
   - Scene preview

3. **Playback Module**
   - Interactive scene player
   - Choice handling
   - State management for paths
   - Progress tracking

4. **Additional Features**
   - Workspace management
   - Collaboration tools
   - Asset management
   - Provider integration

## Technology Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **React Router 7** - Routing
- **Zustand** - State management
- **Axios** - HTTP client
