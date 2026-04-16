import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NewsItem } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..', '..')
const statePath = path.resolve(projectRoot, 'data', 'state.json')

interface State {
  lastRun: string | null
  postedIds: Record<string, string[]>
  lastSeen: Record<string, string>
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
  return JSON.parse(content) as State
}

export function saveState(state: State): void {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
}

export function isNewItem(item: NewsItem, state: State): boolean {
  const sourceKey = item.source
  const postedIds = state.postedIds[sourceKey] || []
  return !postedIds.includes(item.id)
}

export function markPosted(item: NewsItem, state: State): void {
  const sourceKey = item.source

  if (!state.postedIds[sourceKey]) {
    state.postedIds[sourceKey] = []
  }

  state.postedIds[sourceKey].push(item.id)

  // Keep only last 100 IDs per source to prevent unbounded growth
  if (state.postedIds[sourceKey].length > 100) {
    state.postedIds[sourceKey] = state.postedIds[sourceKey].slice(-100)
  }

  state.lastSeen[sourceKey] = item.id
  state.lastRun = new Date().toISOString()
}
