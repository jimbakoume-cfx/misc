import { Component, type ReactNode } from 'react'
import { resetAllSuivixData } from '../../lib/suivix/storage'

// Last line of defence for a frontend-only demo: if data saved in this browser no longer matches
// the app, show a way out instead of a blank page.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 shadow-retool-sm">
          <p className="eyebrow text-primary">Suivix</p>
          <h1 className="text-xl font-semibold tracking-tight">L’application n’a pas pu s’ouvrir</h1>
          <p className="text-sm text-muted-foreground">
            Les données de démonstration enregistrées dans ce navigateur ne sont plus compatibles avec cette version. Réinitialisez-les pour repartir sur l’espace de démonstration.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                resetAllSuivixData()
                window.location.href = '/'
              }}
            >
              Réinitialiser et recharger
            </button>
            <button className="h-9 rounded-md border border-input px-4 text-sm font-medium hover:bg-muted" onClick={() => window.location.reload()}>
              Recharger
            </button>
          </div>
          <p className="font-mono text-[0.7rem] text-muted-foreground">{this.state.error.message}</p>
        </div>
      </div>
    )
  }
}
