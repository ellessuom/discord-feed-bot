import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Plus, AlertCircle, Loader2, Gamepad2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SourceCard } from '@/components/sources/SourceCard'
import { useSourcesStore } from '@/stores/sources'
import { useGitHubStore } from '@/stores/github'
import { useUIStore } from '@/stores/ui'

export function Dashboard() {
  const { sources, isLoading, error, fetchConfig } = useSourcesStore()
  const { isAuthenticated, validatePAT } = useGitHubStore()
  const { openAddModal } = useUIStore()
  const navigate = useNavigate()

  useEffect(() => {
    validatePAT()
  }, [validatePAT])

  useEffect(() => {
    if (isAuthenticated) {
      fetchConfig()
    }
  }, [isAuthenticated, fetchConfig])

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="bg-background-card border-background-border p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-steam-blue mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            GitHub Authentication Required
          </h2>
          <p className="text-text-secondary mb-4">
            To manage your feed sources, you need to authenticate with a GitHub Personal Access
            Token.
          </p>
          <p className="text-text-muted text-sm mb-4">
            Go to Settings to configure your PAT with{' '}
            <code className="bg-background-hover px-1 rounded">repo</code> and{' '}
            <code className="bg-background-hover px-1 rounded">workflow</code> scopes.
          </p>
          <Button
            onClick={() => navigate('/settings')}
            className="bg-steam-blue hover:bg-steam-light"
          >
            Go to Settings
          </Button>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-steam-blue" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="bg-background-card border-background-border p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-status-error mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">Error Loading Sources</h2>
          <p className="text-text-secondary mb-4">{error}</p>
          <Button onClick={fetchConfig} className="bg-steam-blue hover:bg-steam-light">
            Retry
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Sources</h1>
            <p className="text-text-secondary mt-1">
              {sources.length} source{sources.length !== 1 ? 's' : ''} configured
            </p>
          </div>
          <Button onClick={openAddModal} className="bg-steam-blue hover:bg-steam-light">
            <Plus className="h-4 w-4 mr-2" />
            Add Source
          </Button>
        </div>

        {sources.length === 0 ? (
          <Card className="bg-background-card border-background-border p-8 text-center">
            <Gamepad2 className="h-12 w-12 text-text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No Sources Yet</h3>
            <p className="text-text-secondary mb-4">
              Add your first source to start receiving feeds in Discord.
            </p>
            <Button onClick={openAddModal} className="bg-steam-blue hover:bg-steam-light">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Source
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {sources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                onRemove={(id) => useSourcesStore.getState().removeSource(id)}
                onToggle={(id) => useSourcesStore.getState().toggleSourceEnabled(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
