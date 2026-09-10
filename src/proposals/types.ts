/** Steam appids, package ids and bundle ids are independent sequences: namespace them. */
export type ProposalKind = 'app' | 'sub' | 'bundle'

export type ProposalStatus = 'priced' | 'free' | 'unreleased' | 'delisted' | 'unresolved'

export interface ProposalKey {
  kind: ProposalKind
  id: number
}

export interface Mention {
  userId: string
  username: string
  messageId: string
  at: string
}

export interface PriceInfo {
  current: number
  original: number
  discount: number
  currency: string
  lowestSeen: number
  checkedAt: string
}

export interface Proposal {
  kind: ProposalKind
  id: number
  name: string
  url: string
  status: ProposalStatus
  mentions: Mention[]
  threadId?: string | undefined
  starterMessageId?: string | undefined
  price?: PriceInfo | undefined
  headerImage?: string | undefined
  description?: string | undefined
  tags?: string[] | undefined
}

export interface Cursors {
  newestScannedId: string | null
  oldestScannedId: string | null
  backfillComplete: boolean
}

export interface ProposalsFile {
  cursors: Cursors
  proposals: Record<string, Proposal>
}

export function proposalKey(kind: ProposalKind, id: number): string {
  return `${kind}:${id}`
}
