import { Gamepad2, MessageCircle, Rss, GitBranch, Newspaper, Percent } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SourceType } from '@/types/sources'

export const SOURCE_TYPE_ICONS: Record<SourceType, LucideIcon> = {
  steam_game: Gamepad2,
  steam_news: Newspaper,
  steam_sales: Percent,
  reddit: MessageCircle,
  rss: Rss,
  github: GitBranch,
}
