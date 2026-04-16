import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="bg-background-card border-background-border p-8 max-w-md text-center">
            <h2 className="text-xl font-semibold text-text-primary mb-4">Something went wrong</h2>
            <p className="text-text-secondary mb-4 font-mono text-sm break-all">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="bg-steam-blue hover:bg-steam-light"
            >
              Reload Page
            </Button>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
