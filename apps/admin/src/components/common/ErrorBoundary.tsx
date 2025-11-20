import React from 'react';

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ position: 'fixed', bottom: 8, left: 8, right: 8, padding: 8, background: '#fee', color: '#900', border: '1px solid #f99', borderRadius: 6, zIndex: 50 }}>
          <strong>Component crashed.</strong> The panel was disabled. Check console for details.
        </div>
      );
    }
    return this.props.children;
  }
}
