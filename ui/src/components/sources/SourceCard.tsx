import { useState } from 'react'
import {
  MoreVertical,
  Eye,
  Settings,
  RefreshCw,
  Trash2,
  CheckCircle,
  AlertCircle,
  Pause,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { SourceIcon } from '@/components/icons/SourceIcon'
import type { Source } from '@/types/sources'
import { SOURCE_TYPE_INFO } from '@/types/sources'

interface SourceCardProps {
  source: Source
  onEdit?: (source: Source) => void
  onRemove?: (id: string) => void
  onToggle?: (id: string) => void
}

function getStatusBadge(enabled?: boolean) {
  if (enabled === false) {
    return (
      <Badge
        variant="outline"
        className="bg-status-disabled/10 text-status-disabled border-status-disabled/20"
      >
        <Pause className="h-3 w-3 mr-1" />
        Disabled
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="bg-status-active/10 text-status-active border-status-active/20"
    >
      <CheckCircle className="h-3 w-3 mr-1" />
      Active
    </Badge>
  )
}

export function SourceCard({ source, onEdit, onRemove, onToggle }: SourceCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isDisabled = source.type === 'steam_sales'

  return (
    <Card className="bg-background-card border-background-border hover:bg-background-hover transition-colors">
      <div className="p-4 flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-md bg-background-hover flex items-center justify-center text-steam-blue">
          <SourceIcon type={source.type} className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-text-primary font-medium truncate">{source.name}</h3>
            {getStatusBadge(source.enabled)}
          </div>

          <p className="text-sm text-text-secondary mb-2">{SOURCE_TYPE_INFO[source.type].label}</p>

          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            {source.type === 'steam_game' && (
              <span className="font-mono">steam_{source.appid}</span>
            )}
            {source.type === 'reddit' && <span>r/{source.subreddit}</span>}
            {source.type === 'rss' && <span className="truncate max-w-48">{source.url}</span>}
            {source.type === 'github' && (
              <span>
                {source.owner}/{source.repo}
              </span>
            )}
          </div>

          {isDisabled && (
            <div className="mt-2 text-xs text-status-warning flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Coming soon - backend support pending
            </div>
          )}
        </div>

        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-text-secondary hover:text-text-primary"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-background-card border-background-border">
            <DropdownMenuItem onClick={() => onToggle?.(source.id)} disabled={isDisabled}>
              {source.enabled === false ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Enable
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Disable
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit?.(source)} disabled={isDisabled}>
              <Settings className="h-4 w-4 mr-2" />
              Edit Config
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Eye className="h-4 w-4 mr-2" />
              Test Source
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-fetch
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-background-border" />
            <DropdownMenuItem
              onClick={() => onRemove?.(source.id)}
              className="text-status-error focus:text-status-error focus:bg-status-error/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove Source
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
}
