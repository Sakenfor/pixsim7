import { CubeSystemV2 } from '../components/control/CubeSystemV2';
import { Button } from '@pixsim7/ui';
import { useState } from 'react';

export function CubeSystemDemo() {
  const [showCubes, setShowCubes] = useState(false);

  if (showCubes) {
    return (
      <>
        <CubeSystemV2 />
        <button
          onClick={() => setShowCubes(false)}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
        >
          Exit Cube Mode
        </button>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
      <div className="max-w-2xl mx-auto p-8 text-white text-center">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Cube System V2
        </h1>
        <p className="text-xl mb-8 text-gray-300">
          A reimagined control center with purposeful 3D interaction
        </p>

        <div className="grid gap-4 mb-8 text-left bg-black/30 rounded-lg p-6 backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <h3 className="font-bold mb-1">Purpose-Driven Design</h3>
              <p className="text-sm text-gray-400">Each cube has one clear function with 6 contextual faces</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔄</span>
            <div>
              <h3 className="font-bold mb-1">Natural Interactions</h3>
              <p className="text-sm text-gray-400">Rotate to switch functions, connect to create workflows</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎨</span>
            <div>
              <h3 className="font-bold mb-1">Visual Intelligence</h3>
              <p className="text-sm text-gray-400">Colors and positions convey meaning and state</p>
            </div>
          </div>
        </div>

        <Button
          size="lg"
          onClick={() => setShowCubes(true)}
          className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-8 py-4 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
        >
          🎲 Launch Cube System
        </Button>

        <div className="mt-8 text-sm text-gray-400">
          <p>💡 Tip: Use mouse to rotate view, scroll to zoom</p>
        </div>
      </div>
    </div>
  );
}