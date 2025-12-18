/**
 * Panel Settings Error Boundary
 *
 * Isolates errors from plugin-provided settings components.
 * Prevents one bad plugin from breaking the entire settings screen.
 */

import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  panelId: string;
  sectionId?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class PanelSettingsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { panelId, sectionId } = this.props;
    const location = sectionId
      ? `panel "${panelId}" section "${sectionId}"`
      : `panel "${panelId}"`;

    console.error(`Error in settings component for ${location}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { panelId, sectionId } = this.props;
      const location = sectionId ? `${panelId} / ${sectionId}` : panelId;

      return (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">
                Settings Component Error
              </h3>
              <p className="text-xs text-red-700 dark:text-red-300 mb-2">
                The settings component for <strong>{location}</strong> encountered an error and
                could not be displayed.
              </p>
              {this.state.error && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-red-600 dark:text-red-400 hover:underline">
                    Error details
                  </summary>
                  <pre className="mt-2 p-2 bg-red-100 dark:bg-red-900/40 rounded text-[10px] overflow-auto">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
