import { NavLink } from 'react-router'
import { Plus, Settings, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useSourcesStore } from '@/stores/sources'
import { useUIStore } from '@/stores/ui'
import { useGitHubStore } from '@/stores/github'
import { SourceIcon } from '@/components/icons/SourceIcon'
import type { SourceType } from '@/types/sources'

export function Sidebar() {
  const { sources } = useSourcesStore()
  const { openAddModal } = useUIStore()
  const { isAuthenticated } = useGitHubStore()

  const sourceCounts = sources.reduce(
    (acc, source) => {
      const type = source.type
      acc[type] = (acc[type] || 0) + 1
      return acc
    },
    {} as Record<SourceType, number>
  )

  return (
    <aside className="w-64 bg-background-card border-r border-background-border flex flex-col">
      <div className="p-4">
        <Button
          onClick={openAddModal}
          className="w-full bg-steam-blue hover:bg-steam-light text-background"
          disabled={!isAuthenticated}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Source
        </Button>
      </div>

      <Separator className="bg-background-border" />

      <ScrollArea className="flex-1">
        <nav className="p-2">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-background-hover text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
              }`
            }
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </NavLink>

          <div className="mt-4 mb-2 px-3 text-xs font-medium text-text-muted uppercase tracking-wider">
            Sources
          </div>

          {(
            ['steam_game', 'steam_news', 'steam_sales', 'reddit', 'rss', 'github'] as SourceType[]
          ).map((type) => {
            const count = sourceCounts[type] || 0
            const labels: Record<SourceType, string> = {
              steam_game: 'Steam Games',
              steam_news: 'Steam News',
              steam_sales: 'Steam Sales',
              reddit: 'Reddit',
              rss: 'RSS',
              github: 'GitHub',
            }

            if (count === 0 && type !== 'steam_game') return null

            return (
              <NavLink
                key={type}
                to={`/?type=${type}`}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-background-hover text-text-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
                  }`
                }
              >
                <span className="flex items-center gap-3">
                  <SourceIcon type={type} className="h-4 w-4" />
                  {labels[type]}
                </span>
                {count > 0 && <span className="text-xs text-text-muted">{count}</span>}
              </NavLink>
            )
          })}
        </nav>
      </ScrollArea>

      <Separator className="bg-background-border" />

      <div className="p-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-background-hover text-text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
            }`
          }
        >
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
      </div>
    </aside>
  )
}
