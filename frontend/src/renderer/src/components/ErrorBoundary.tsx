import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-surface text-fg p-8">
            <h1 className="text-display font-bold mb-2">Algo salió mal</h1>
            <p className="text-base text-muted mb-4 max-w-md text-center">
              PDF Master encontró un error inesperado. Guarda tu trabajo y reinicia la aplicación.
            </p>
            <pre className="text-mini bg-panel border border-border p-3 rounded-token-sm max-w-lg overflow-auto text-muted">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 rounded-token-sm text-base font-medium bg-accent text-on-accent hover:brightness-110 active:brightness-95 transition-[filter] duration-fast ease-token transition-opacity"
            >
              Reiniciar
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
