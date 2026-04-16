import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const statePath = path.resolve(projectRoot, 'data', 'state.json')

const MAX_AGE_DAYS = 30
const MAX_IDS_PER_SOURCE = 100

interface PostedId {
  id: string
  postedAt: string
}

interface State {
  lastRun: string | null
  postedIds: Record<string, PostedId[]>
  lastSeen: Record<string, string>
}

interface LegacyState {
  lastRun: string | null
  postedIds: Record<string, string[]>
  lastSeen: Record<string, string>
}

function isLegacyState(data: unknown): data is LegacyState {
  if (!data || typeof data !== 'object') return false
  const state = data as Record<string, unknown>
  if (!('postedIds' in state)) return false
  const postedIds = state.postedIds
  if (!postedIds || typeof postedIds !== 'object') return false
  const firstKey = Object.keys(postedIds)[0]
  if (!firstKey) return false
  const firstValue = (postedIds as Record<string, unknown>)[firstKey]
  return Array.isArray(firstValue) && typeof firstValue[0] === 'string'
}

function migrateLegacyState(legacy: LegacyState): State {
  const migrated: Record<string, PostedId[]> = {}
  const now = new Date().toISOString()

  for (const [source, ids] of Object.entries(legacy.postedIds)) {
    if (Array.isArray(ids)) {
      migrated[source] = ids.map((id) => ({ id, postedAt: now }))
    }
  }

  return {
    lastRun: legacy.lastRun,
    postedIds: migrated,
    lastSeen: legacy.lastSeen,
  }
}

function pruneOldIds(state: State): void {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
  for (const sourceKey of Object.keys(state.postedIds)) {
    const ids = state.postedIds[sourceKey]
    if (ids) {
      state.postedIds[sourceKey] = ids.filter((entry) => new Date(entry.postedAt) > cutoff)
    }
  }
}

export function loadState(): State {
  if (!fs.existsSync(statePath)) {
    return {
      lastRun: null,
      postedIds: {},
      lastSeen: {},
    }
  }

  const content = fs.readFileSync(statePath, 'utf-8')
  const raw = JSON.parse(content)

  const state = isLegacyState(raw) ? migrateLegacyState(raw) : (raw as State)

  pruneOldIds(state)

  return state
}

export function saveState(state: State): void {
  pruneOldIds(state)

  for (const sourceKey of Object.keys(state.postedIds)) {
    const ids = state.postedIds[sourceKey]
    if (ids && ids.length > MAX_IDS_PER_SOURCE) {
      state.postedIds[sourceKey] = ids.slice(-MAX_IDS_PER_SOURCE)
    }
  }

  const dataDir = path.dirname(statePath)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
}

export function isNewItem(id: string, source: string, state: State): boolean {
  const postedIds = state.postedIds[source] || []
  return !postedIds.some((entry) => entry.id === id)
}

export function markPosted(id: string, source: string, state: State): void {
  if (!state.postedIds[source]) {
    state.postedIds[source] = []
  }

  state.postedIds[source].push({
    id,
    postedAt: new Date().toISOString(),
  })

  state.lastSeen[source] = id
  state.lastRun = new Date().toISOString()
}
