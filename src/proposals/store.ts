import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProposalsFile } from './types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..', '..')
const proposalsPath = path.resolve(projectRoot, 'data', 'proposals.json')

/**
 * Deliberately separate from data/state.json: that file prunes at 30 days and
 * caps 100 ids per source, which would silently erase a permanent backlog.
 * Nothing here is ever pruned.
 */
export function emptyProposals(): ProposalsFile {
  return {
    cursors: { newestScannedId: null, oldestScannedId: null, backfillComplete: false },
    proposals: {},
  }
}

export function loadProposals(): ProposalsFile {
  if (!fs.existsSync(proposalsPath)) {
    return emptyProposals()
  }

  const raw = JSON.parse(fs.readFileSync(proposalsPath, 'utf-8')) as Partial<ProposalsFile>

  return {
    cursors: {
      newestScannedId: raw.cursors?.newestScannedId ?? null,
      oldestScannedId: raw.cursors?.oldestScannedId ?? null,
      backfillComplete: raw.cursors?.backfillComplete ?? false,
    },
    proposals: raw.proposals ?? {},
  }
}

export function saveProposals(data: ProposalsFile): void {
  const dataDir = path.dirname(proposalsPath)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  fs.writeFileSync(proposalsPath, JSON.stringify(data, null, 2))
}

export function getProposalsPath(): string {
  return proposalsPath
}
