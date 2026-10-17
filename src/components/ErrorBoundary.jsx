import { Component } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

/** A lazy chunk that fails to load is almost always a stale tab after a new deployment, or a dropped connection. */
export function isChunkLoadError(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`;
  return /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(text);
}

/**
 * Catches render errors so one broken panel never blanks the whole app.
 * `variant="page"` is the last-resort full-page fallback; `variant="panel"` keeps the rest of the UI usable.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[StoryMotion] UI error', error, info?.componentStack);
  }

  retry() {
    if (isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    const { variant = 'panel', label = 'This part of the app' } = this.props;
    const title = chunk ? `${label} could not be loaded` : `${label} ran into a problem`;
    const body = chunk
      ? 'This usually happens after an update to StoryMotion or a dropped connection. Reloading fixes it, and your saved project is kept.'
      : 'Your work is saved in this browser. Try again; if it keeps happening, reload the page or export a JSON backup first.';
    return (
      <div className={`error-panel${variant === 'page' ? ' is-page' : ''}`} role="alert">
        <TriangleAlert size={22} aria-hidden="true" />
        <div>
          <h2>{title}</h2>
          <p>{body}</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={this.retry}>
              <RotateCcw size={15} aria-hidden="true" />
              {chunk ? 'Reload' : 'Try again'}
            </button>
            {variant === 'page' && !chunk && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
                Reload page
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
