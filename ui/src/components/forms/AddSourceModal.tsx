import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Search, Loader2 } from 'lucide-react'
import { useUIStore } from '@/stores/ui'
import { useSourcesStore } from '@/stores/sources'
import { searchSteamGames, type SteamGame } from '@/integrations/steam'
import { SourceIcon } from '@/components/icons/SourceIcon'
import type { SourceType, Source } from '@/types/sources'
import { SOURCE_TYPE_INFO } from '@/types/sources'
import { safeBase64Encode } from '@/utils/encoding'

const sourceTypes: SourceType[] = [
  'steam_game',
  'steam_news',
  'steam_sales',
  'reddit',
  'rss',
  'github',
]

function SteamGameForm({ onAdd }: { onAdd: (source: Source) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SteamGame[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualAppId, setManualAppId] = useState('')

  const handleSearch = async () => {
    if (!query.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      const games = await searchSteamGames(query)
      setResults(games)
    } catch {
      setError('Failed to search Steam. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectGame = (game: SteamGame) => {
    const source: Source = {
      id: `steam_${game.appid}`,
      type: 'steam_game',
      name: game.name,
      appid: game.appid,
      enabled: true,
    }
    onAdd(source)
  }

  const handleAddManual = () => {
    const appid = parseInt(manualAppId)
    if (isNaN(appid) || appid <= 0) return

    const source: Source = {
      id: `steam_${appid}`,
      type: 'steam_game',
      name: `Steam Game ${appid}`,
      appid,
      enabled: true,
    }
    onAdd(source)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="steam-search">Search Steam Games</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <Input
              id="steam-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by game name..."
              className="pl-10"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch()
              }}
            />
          </div>
          <Button onClick={handleSearch} disabled={isLoading || !query.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-background-hover animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && results.length > 0 && (
        <div className="space-y-3 max-h-60 overflow-y-auto">
          {results.map((game) => (
            <div
              key={game.appid}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-background-hover transition-colors cursor-pointer border border-background-border"
              onClick={() => handleSelectGame(game)}
            >
              <div className="flex items-center gap-3">
                <img
                  src={game.tiny_image}
                  alt={game.name}
                  className="h-10 w-10 rounded object-cover"
                />
                <div>
                  <div className="text-text-primary font-medium">{game.name}</div>
                  <div className="text-xs text-text-muted">AppID: {game.appid}</div>
                </div>
              </div>
              <Button size="sm" className="bg-steam-blue hover:bg-steam-light">
                Add
              </Button>
            </div>
          ))}
        </div>
      )}

      {!isLoading && query && results.length === 0 && !error && (
        <Alert>
          <AlertDescription>
            No games found. Try a different search term or enter AppID manually.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-background-border" />
        <span className="text-xs text-text-muted">OR</span>
        <div className="h-px flex-1 bg-background-border" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="manual-appid">Enter AppID Manually</Label>
        <div className="flex gap-2">
          <Input
            id="manual-appid"
            value={manualAppId}
            onChange={(e) => setManualAppId(e.target.value)}
            placeholder="e.g., 730"
            className="font-mono"
          />
          <Button onClick={handleAddManual} disabled={!manualAppId || isNaN(parseInt(manualAppId))}>
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}

function SteamNewsForm({ onAdd }: { onAdd: (source: Source) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-text-secondary text-sm">
        Steam News provides platform-wide announcements from Valve (Steam updates, events, features,
        etc.).
      </p>
      <Button
        onClick={() =>
          onAdd({ id: 'steam_news', type: 'steam_news', name: 'Steam News', enabled: true })
        }
      >
        Add Steam News
      </Button>
    </div>
  )
}

function SteamSalesForm({ onAdd }: { onAdd: (source: Source) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-text-secondary text-sm">
        Steam Sales shows current deals and featured promotions from the Steam store. Updates
        periodically with the latest discounts.
      </p>
      <Button
        onClick={() =>
          onAdd({ id: 'steam_sales', type: 'steam_sales', name: 'Steam Sales', enabled: true })
        }
        className="bg-steam-blue hover:bg-steam-light"
      >
        Add Steam Sales
      </Button>
    </div>
  )
}

function RedditForm({ onAdd }: { onAdd: (source: Source) => void }) {
  const [subreddit, setSubreddit] = useState('')

  const handleAdd = () => {
    const name = subreddit.replace(/^r\//, '')
    const source: Source = {
      id: `reddit_${name.toLowerCase()}`,
      type: 'reddit',
      name: `r/${name}`,
      subreddit: name,
      enabled: true,
    }
    onAdd(source)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="subreddit">Subreddit Name</Label>
        <Input
          id="subreddit"
          value={subreddit}
          onChange={(e) => setSubreddit(e.target.value)}
          placeholder="e.g., Steam or r/Steam"
        />
      </div>
      <Button
        onClick={handleAdd}
        disabled={!subreddit.trim()}
        className="bg-steam-blue hover:bg-steam-light"
      >
        Add Subreddit
      </Button>
    </div>
  )
}

function RSSForm({ onAdd }: { onAdd: (source: Source) => void }) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')

  const handleAdd = () => {
    const source: Source = {
      id: `rss_${safeBase64Encode(url).slice(0, 12)}`,
      type: 'rss',
      name: name || new URL(url).hostname,
      url,
      enabled: true,
    }
    onAdd(source)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rss-url">Feed URL</Label>
        <Input
          id="rss-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/feed.xml"
          type="url"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rss-name">Display Name (optional)</Label>
        <Input
          id="rss-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Blog"
        />
      </div>
      <Button
        onClick={handleAdd}
        disabled={!url.trim() || !url.startsWith('http')}
        className="bg-steam-blue hover:bg-steam-light"
      >
        Add RSS Feed
      </Button>
    </div>
  )
}

function GitHubForm({ onAdd }: { onAdd: (source: Source) => void }) {
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')

  const handleAdd = () => {
    const source: Source = {
      id: `github_${owner}_${repo}`.toLowerCase(),
      type: 'github',
      name: `${owner}/${repo}`,
      owner,
      repo,
      enabled: true,
    }
    onAdd(source)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="gh-owner">Owner</Label>
        <Input
          id="gh-owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="e.g., facebook"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="gh-repo">Repository</Label>
        <Input
          id="gh-repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="e.g., react"
        />
      </div>
      <Button
        onClick={handleAdd}
        disabled={!owner.trim() || !repo.trim()}
        className="bg-steam-blue hover:bg-steam-light"
      >
        Add Repository
      </Button>
    </div>
  )
}

export function AddSourceModal() {
  const { isAddModalOpen, closeAddModal } = useUIStore()
  const { addSource, isLoading } = useSourcesStore()
  const [selectedType, setSelectedType] = useState<SourceType | null>(null)

  const handleAdd = async (source: Source) => {
    await addSource(source)
    closeAddModal()
    setSelectedType(null)
  }

  return (
    <Dialog open={isAddModalOpen} onOpenChange={(open) => !open && closeAddModal()}>
      <DialogContent className="bg-background-card border-background-border max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Add New Source</DialogTitle>
          <DialogDescription>Choose a source type to start receiving feeds.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="space-y-3">
            <Label>Select Source Type</Label>
            <div className="grid grid-cols-2 gap-4">
              {sourceTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`p-4 rounded-lg border transition-colors text-left ${
                    selectedType === type
                      ? 'bg-steam-blue/10 border-steam-blue text-text-primary'
                      : 'bg-background border-background-border text-text-secondary hover:bg-background-hover'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2 text-steam-blue">
                    <SourceIcon type={type} className="h-5 w-5" />
                    <span className="font-medium">{SOURCE_TYPE_INFO[type].label}</span>
                  </div>
                  <p className="text-xs">{SOURCE_TYPE_INFO[type].description}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedType === 'steam_game' && <SteamGameForm onAdd={handleAdd} />}
          {selectedType === 'steam_news' && <SteamNewsForm onAdd={handleAdd} />}
          {selectedType === 'steam_sales' && <SteamSalesForm onAdd={handleAdd} />}
          {selectedType === 'reddit' && <RedditForm onAdd={handleAdd} />}
          {selectedType === 'rss' && <RSSForm onAdd={handleAdd} />}
          {selectedType === 'github' && <GitHubForm onAdd={handleAdd} />}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
