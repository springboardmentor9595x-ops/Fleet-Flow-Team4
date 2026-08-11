import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md space-y-4 shadow-2xl">
            <span className="text-4xl">⚠️</span>
            <h2 className="text-xl font-bold text-cyan-400">Application Error Encountered</h2>
            <p className="text-xs text-slate-400 font-mono bg-slate-950 p-3 rounded-lg border border-slate-800 text-left overflow-x-auto">
              {this.state.error?.toString() || "Unknown rendering exception"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/login";
              }}
              className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition"
            >
              Return to Login Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
