import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Uncaught Application Error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.hash = 'home';
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="page-container flex items-center justify-center min-h-[60vh] py-12">
          <div className="auth-card max-w-lg text-center p-8 bg-white rounded-2xl shadow-xl border border-red-100">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-200">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Something went wrong</h2>
            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              An unexpected error occurred while rendering this view. Your session and data are safe.
            </p>
            {this.state.error?.message && (
              <div className="bg-slate-50 text-slate-700 p-3 rounded-lg text-xs font-mono text-left mb-6 overflow-auto max-h-32 border border-slate-200">
                {this.state.error.message}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                className="btn btn-primary flex items-center gap-2"
                onClick={this.handleReset}
              >
                <RefreshCw size={16} />
                <span>Reload Application</span>
              </button>
              <button
                type="button"
                className="btn btn-outline flex items-center gap-2"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.hash = 'home';
                }}
              >
                <Home size={16} />
                <span>Go to Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
