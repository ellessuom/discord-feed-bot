import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { useGitHubStore } from '@/stores/github'

export function SettingsPage() {
  const { user, isAuthenticated, isLoading, setPAT, clearPAT, validatePAT } = useGitHubStore()
  const [pat, setPat] = useState(() => localStorage.getItem('github_pat') || '')
  const [discordWebhook, setDiscordWebhook] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    validatePAT()
  }, [validatePAT])

  const handleSavePAT = async () => {
    if (!pat.trim()) return
    await setPAT(pat)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = () => {
    clearPAT()
    setPat('')
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
          <p className="text-text-secondary mt-1">Configure your GitHub PAT and Discord webhook.</p>
        </div>

        <Card className="bg-background-card border-background-border">
          <CardHeader>
            <CardTitle className="text-text-primary">GitHub PAT Configuration</CardTitle>
            <CardDescription>Personal Access Token for GitHub API access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-2 text-status-active mb-4">
                <CheckCircle className="h-5 w-5" />
                <span>Authenticated as {user.login}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-status-warning mb-4">
                <AlertTriangle className="h-5 w-5" />
                <span>Not authenticated</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="github-pat">GitHub PAT</Label>
              <div className="flex gap-2">
                <Input
                  id="github-pat"
                  type="password"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="flex-1"
                />
                <Button onClick={handleSavePAT} disabled={isLoading || !pat.trim()}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
              {saved && <p className="text-sm text-status-active">Saved successfully!</p>}
              {isAuthenticated && (
                <Button variant="outline" onClick={handleClear} className="mt-2">
                  Clear Token
                </Button>
              )}
              <p className="text-xs text-text-muted">
                PAT is stored in your browser's localStorage. Never share your token.
              </p>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Required Scopes</AlertTitle>
              <AlertDescription>
                Your PAT must have these scopes:
                <ul className="list-disc ml-4 mt-2 space-y-1">
                  <li>
                    <code className="bg-background-hover px-1 rounded">repo</code> (read/write)
                  </li>
                  <li>
                    <code className="bg-background-hover px-1 rounded">workflow</code> (trigger
                    actions)
                  </li>
                </ul>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card className="bg-background-card border-background-border opacity-50">
          <CardHeader>
            <CardTitle className="text-text-primary">Discord Webhook</CardTitle>
            <CardDescription>Channel for posting feeds. (Managed via config.yaml)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="discord-webhook">Webhook URL</Label>
              <Input
                id="discord-webhook"
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                disabled
              />
              <p className="text-xs text-text-muted">
                The Discord webhook URL is configured in the repository's config.yaml file. Edit the
                file directly to change the webhook.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background-card border-background-border opacity-50">
          <CardHeader>
            <CardTitle className="text-text-primary">Global Settings</CardTitle>
            <CardDescription>Configure feed behavior. (Managed via config.yaml)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-text-muted text-sm">
              Settings like max posts per run, image inclusion, and post order are configured
              directly in the config.yaml file. Use this UI for source management only.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
