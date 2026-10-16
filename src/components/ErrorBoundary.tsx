import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * A screen that crashed shows this instead of a blank page, with Reload; the error goes to the
 * admin's Logs tab (onError → repo.reportError in App).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onError: (e: unknown, info: ErrorInfo) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown, info: ErrorInfo) {
    this.props.onError(e, info)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center px-6 text-center" role="alert" data-testid="crash-screen">
        <div className="text-4xl" aria-hidden>
          🧯
        </div>
        <h1 className="mt-3 text-lg font-bold">This screen hit a problem</h1>
        <p className="text-muted mt-1 text-sm">Your data is safe. Reload to carry on; the problem has been reported.</p>
        <button type="button" className="btn-primary mt-5" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
