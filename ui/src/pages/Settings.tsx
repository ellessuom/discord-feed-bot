import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { useGitHubStore } from '@/stores/github'
import { useSourcesStore } from '@/stores/sources'
import { toast } from 'sonner'

export function SettingsPage() {
  const { user, isAuthenticated, isLoading, setPAT, clearPAT, validatePAT } = useGitHubStore()
  const {
    config,
    updateDiscordWebhook,
    updateSettings,
    isLoading: configLoading,
  } = useSourcesStore()
  const [pat, setPat] = useState(() => localStorage.getItem('github_pat') || '')
  const [saved, setSaved] = useState(false)

  const [discordWebhook, setDiscordWebhook] = useState('')
  const [maxPosts, setMaxPosts] = useState('10')
  const [includeImages, setIncludeImages] = useState(true)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    validatePAT()
  }, [validatePAT])

  const configDiscordWebhook = useMemo(
    () => config?.discord.webhook_url ?? '',
    [config?.discord.webhook_url]
  )
  const configMaxPosts = useMemo(
    () => config?.settings.max_posts_per_run ?? 10,
    [config?.settings.max_posts_per_run]
  )
  const configIncludeImages = useMemo(
    () => config?.settings.include_images ?? true,
    [config?.settings.include_images]
  )

  useEffect(() => {
    if (config && !initialized) {
      setDiscordWebhook(configDiscordWebhook)
      setMaxPosts(String(configMaxPosts))
      setIncludeImages(configIncludeImages)
      setInitialized(true)
    }
  }, [config, initialized, configDiscordWebhook, configMaxPosts, configIncludeImages])

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

  const handleSaveWebhook = async () => {
    if (!discordWebhook.trim()) {
      toast.error('Webhook URL is required')
      return
    }
    await updateDiscordWebhook(discordWebhook)
    toast.success('Discord webhook updated')
  }

  const handleSaveSettings = async () => {
    const maxPostsNum = parseInt(maxPosts)
    if (isNaN(maxPostsNum) || maxPostsNum < 1 || maxPostsNum > 100) {
      toast.error('Max posts must be between 1 and 100')
      return
    }
    await updateSettings({
      max_posts_per_run: maxPostsNum,
      include_images: includeImages,
    })
    toast.success('Settings updated')
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

        <Card className="bg-background-card border-background-border">
          <CardHeader>
            <CardTitle className="text-text-primary">Discord Webhook</CardTitle>
            <CardDescription>Channel for posting feeds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="discord-webhook">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  id="discord-webhook"
                  value={discordWebhook}
                  onChange={(e) => setDiscordWebhook(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  type="password"
                  className="flex-1"
                />
                <Button
                  onClick={handleSaveWebhook}
                  disabled={configLoading || !discordWebhook.trim()}
                >
                  {configLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
              <p className="text-xs text-text-muted">
                The Discord webhook URL where feeds will be posted. Keep this secret.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background-card border-background-border">
          <CardHeader>
            <CardTitle className="text-text-primary">Global Settings</CardTitle>
            <CardDescription>Configure feed behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="max-posts">Max Posts Per Run</Label>
              <div className="flex gap-2">
                <Input
                  id="max-posts"
                  type="number"
                  min={1}
                  max={100}
                  value={maxPosts}
                  onChange={(e) => setMaxPosts(e.target.value)}
                  className="w-32"
                />
              </div>
              <p className="text-xs text-text-muted">
                Maximum number of posts per workflow run (1-100).
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="include-images">Include Images</Label>
                <p className="text-xs text-text-muted">Show thumbnails in Discord embeds.</p>
              </div>
              <Switch
                id="include-images"
                checked={includeImages}
                onCheckedChange={setIncludeImages}
              />
            </div>

            <Button onClick={handleSaveSettings} disabled={configLoading}>
              {configLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
