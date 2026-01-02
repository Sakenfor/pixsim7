import type { StateCreator, SignatureManagementState } from './types';

/**
 * Signature Management Slice
 *
 * Handles scene signature operations: parameters and return points
 */
export const createSignatureSlice: StateCreator<SignatureManagementState> = (set) => ({
  updateSceneSignature: (sceneId, signaturePatch) => {
    set(
      (state) => {
        const scene = state.scenes[sceneId];
        if (!scene) return state;

        return {
          scenes: {
            ...state.scenes,
            [sceneId]: {
              ...scene,
              signature: {
                ...(scene.signature || {
                  parameters: [],
                  returnPoints: [],
                  isReusable: false,
                  version: 1,
                }),
                ...signaturePatch,
              },
              updatedAt: new Date().toISOString(),
            },
          },
        };
      },
      false,
      'updateSceneSignature'
    );
  },

  addSceneParameter: (sceneId, parameter) => {
    set(
      (state) => {
        const scene = state.scenes[sceneId];
        if (!scene || !scene.signature) return state;

        // Check for duplicate parameter name
        if (scene.signature.parameters.some((p) => p.name === parameter.name)) {
          console.warn(`[signatureSlice] Parameter ${parameter.name} already exists`);
          return state;
        }

        return {
          scenes: {
            ...state.scenes,
            [sceneId]: {
              ...scene,
              signature: {
                ...scene.signature,
                parameters: [...scene.signature.parameters, parameter],
              },
              updatedAt: new Date().toISOString(),
            },
          },
        };
      },
      false,
      'addSceneParameter'
    );
  },

  removeSceneParameter: (sceneId, parameterName) => {
    set(
      (state) => {
        const scene = state.scenes[sceneId];
        if (!scene || !scene.signature) return state;

        return {
          scenes: {
            ...state.scenes,
            [sceneId]: {
              ...scene,
              signature: {
                ...scene.signature,
                parameters: scene.signature.parameters.filter((p) => p.name !== parameterName),
              },
              updatedAt: new Date().toISOString(),
            },
          },
        };
      },
      false,
      'removeSceneParameter'
    );
  },

  addReturnPoint: (sceneId, returnPoint) => {
    set(
      (state) => {
        const scene = state.scenes[sceneId];
        if (!scene || !scene.signature) return state;

        // Check for duplicate return point ID
        if (scene.signature.returnPoints.some((rp) => rp.id === returnPoint.id)) {
          console.warn(`[signatureSlice] Return point ${returnPoint.id} already exists`);
          return state;
        }

        return {
          scenes: {
            ...state.scenes,
            [sceneId]: {
              ...scene,
              signature: {
                ...scene.signature,
                returnPoints: [...scene.signature.returnPoints, returnPoint],
              },
              updatedAt: new Date().toISOString(),
            },
          },
        };
      },
      false,
      'addReturnPoint'
    );
  },

  removeReturnPoint: (sceneId, returnPointId) => {
    set(
      (state) => {
        const scene = state.scenes[sceneId];
        if (!scene || !scene.signature) return state;

        return {
          scenes: {
            ...state.scenes,
            [sceneId]: {
              ...scene,
              signature: {
                ...scene.signature,
                returnPoints: scene.signature.returnPoints.filter((rp) => rp.id !== returnPointId),
              },
              updatedAt: new Date().toISOString(),
            },
          },
        };
      },
      false,
      'removeReturnPoint'
    );
  },
});
