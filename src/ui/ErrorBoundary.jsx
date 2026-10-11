import { Component } from 'react';

// If any part of the app crashes, show a friendly message with a Reload
// button instead of a blank screen. (Your notebooks are safe: everything
// is saved in the database as you go.) Error boundaries must be classes in
// React; it's the only place we use one.
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Peel crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state">
        <h2>Something went wrong</h2>
        <p>Your notebooks are safe. Reload Peel to continue.</p>
        <p className="muted small">{String(this.state.error?.message ?? this.state.error)}</p>
        <div className="row">
          <button className="button primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            className="button"
            onClick={() => {
              location.hash = '#/';
              location.reload();
            }}
          >
            Back to the library
          </button>
        </div>
      </div>
    );
  }
}
