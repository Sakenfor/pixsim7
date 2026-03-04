/**
 * PanelErrorBoundary
 *
 * Error boundary for dockview panels. Catches render errors from individual
 * panel components and shows an inline fallback with retry, preventing a
 * single panel crash from taking down the entire dockview.
 */

import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Panel definition ID for display */
  panelId: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[PanelErrorBoundary] Panel "${this.props.panelId}" crashed:`,
      error,
      errorInfo,
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-6">
          <div className="max-w-sm w-full text-center space-y-3">
            <div className="text-3xl">⚠</div>
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Panel crashed
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              <span className="font-mono bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded">
                {this.props.panelId}
              </span>{' '}
              encountered an error.
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
            {this.state.error && (
              <details className="text-left text-xs mt-2">
                <summary className="cursor-pointer text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300">
                  Error details
                </summary>
                <pre className="mt-2 p-2 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-[10px] overflow-auto max-h-40 text-neutral-600 dark:text-neutral-400">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
