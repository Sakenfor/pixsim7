import { Component, type ReactNode } from 'react';
import { logEvent } from '../../lib/logging';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  cubeId?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary for cube expansion components
 * Prevents crashes in expansion components from breaking the entire cube system
 */
export class CubeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to backend for monitoring
    logEvent('ERROR', 'cube_expansion_error', {
      cubeId: this.props.cubeId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    console.error('Cube expansion error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <div className="text-red-400 text-sm mb-2">⚠️ Expansion Error</div>
          <div className="text-neutral-400 text-xs mb-3">
            {this.state.error?.message || 'An error occurred'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-3 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 rounded transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
