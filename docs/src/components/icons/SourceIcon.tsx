import type { SourceType } from '@/types/sources'
import { SOURCE_TYPE_ICONS } from './source-icons'

export function SourceIcon({ type, className }: { type: SourceType; className?: string }) {
  const Icon = SOURCE_TYPE_ICONS[type]
  return <Icon className={className} />
}
