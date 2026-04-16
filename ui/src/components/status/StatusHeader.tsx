import { useEffect } from 'react'
import { Play, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useStatusStore } from '@/stores/status'
import { useGitHubStore } from '@/stores/github'

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never'

  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function StatusHeader() {
  const { status, isLoading: statusLoading, fetchStatus } = useStatusStore()
  const { isLoading: githubLoading, triggerWorkflow } = useGitHubStore()

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleRunNow = async () => {
    await triggerWorkflow()
    setTimeout(() => fetchStatus(), 3000)
  }

  const isLoading = statusLoading || githubLoading

  return (
    <Card className="bg-background-card border-background-border mb-6">
      <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            {status?.success ? (
              <CheckCircle className="h-5 w-5 text-status-active" />
            ) : status ? (
              <XCircle className="h-5 w-5 text-status-error" />
            ) : (
              <Clock className="h-5 w-5 text-text-muted" />
            )}
            <div>
              <p className="text-xs text-text-muted">Last run</p>
              <p className="text-sm text-text-primary font-medium">
                {status ? formatRelativeTime(status.lastRun) : 'No data'}
              </p>
            </div>
          </div>

          <div className="h-8 w-px bg-background-border" />

          <div>
            <p className="text-xs text-text-muted">Posts</p>
            <p className="text-sm text-text-primary font-medium">{status?.postsCount ?? 0}</p>
          </div>

          <div className="h-8 w-px bg-background-border" />

          <div>
            <p className="text-xs text-text-muted">Sources</p>
            <p className="text-sm text-text-primary font-medium">{status?.sourcesCount ?? 0}</p>
          </div>

          {status?.errors && status.errors.length > 0 && (
            <>
              <div className="h-8 w-px bg-background-border" />
              <div>
                <p className="text-xs text-text-muted">Errors</p>
                <p className="text-sm text-status-error font-medium">{status.errors.length}</p>
              </div>
            </>
          )}
        </div>

        <Button
          onClick={handleRunNow}
          disabled={isLoading}
          className="bg-steam-blue hover:bg-steam-light"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Run Now
        </Button>
      </div>

      {status?.errors && status.errors.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-status-error/10 border border-status-error/20 rounded-md p-3">
            <p className="text-xs font-medium text-status-error mb-2">
              Recent Errors ({status.errors.length})
            </p>
            <div className="space-y-1 max-h-24 overflow-auto">
              {status.errors.slice(-3).map((error, index) => (
                <p key={index} className="text-xs text-text-secondary">
                  <span className="font-mono text-text-primary">{error.source}</span>:{' '}
                  {error.message}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
