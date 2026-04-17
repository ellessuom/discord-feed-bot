import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface PostedId {
  id: string
  postedAt: string
}

interface State {
  lastRun: string | null
  postedIds: Record<string, PostedId[]>
  lastSeen: Record<string, string>
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const dataDir = path.resolve(projectRoot, 'data')
const statePath = path.resolve(dataDir, 'state.json')
const backupPath = path.resolve(dataDir, 'state.json.backup')

function backupOriginalState() {
  if (fs.existsSync(statePath)) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    fs.copyFileSync(statePath, backupPath)
  }
}

function restoreOriginalState() {
  if (fs.existsSync(backupPath)) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    fs.copyFileSync(backupPath, statePath)
    fs.unlinkSync(backupPath)
  } else if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath)
  }
}

function deleteState() {
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath)
  }
}

function writeState(state: object) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
}

function readStateFile(): State | null {
  if (!fs.existsSync(statePath)) {
    return null
  }
  const content = fs.readFileSync(statePath, 'utf-8')
  return JSON.parse(content)
}

const { loadState, saveState, isNewItem, markPosted } = await import('../state')

describe('state', () => {
  beforeEach(() => {
    backupOriginalState()
    deleteState()
  })

  afterEach(() => {
    restoreOriginalState()
  })

  describe('loadState', () => {
    test('returns empty state when state file does not exist', () => {
      deleteState()

      const state = loadState()

      expect(state.lastRun).toBeNull()
      expect(state.postedIds).toEqual({})
      expect(state.lastSeen).toEqual({})
    })

    test('returns empty state when data directory does not exist', () => {
      deleteState()
      if (fs.existsSync(dataDir)) {
        fs.rmSync(dataDir, { recursive: true })
      }

      const state = loadState()

      expect(state.lastRun).toBeNull()
      expect(state.postedIds).toEqual({})
      expect(state.lastSeen).toEqual({})
    })

    test('loads existing state file', () => {
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      const existingState = {
        lastRun: '2024-01-01T00:00:00.000Z',
        postedIds: {
          'source-1': [{ id: 'item-1', postedAt: recentDate }],
        },
        lastSeen: {
          'source-1': 'item-1',
        },
      }
      writeState(existingState)

      const state = loadState()

      expect(state.lastRun).toBe('2024-01-01T00:00:00.000Z')
      expect(state.postedIds['source-1']).toHaveLength(1)
      expect(state.postedIds['source-1']?.[0]?.id).toBe('item-1')
    })

    test('migrates legacy state with string[] postedIds', () => {
      const legacyState = {
        lastRun: '2024-01-01T00:00:00.000Z',
        postedIds: {
          'source-1': ['item-1', 'item-2', 'item-3'],
        },
        lastSeen: {
          'source-1': 'item-3',
        },
      }
      writeState(legacyState)

      const state = loadState()

      expect(state.postedIds['source-1']).toHaveLength(3)
      expect(state.postedIds['source-1']?.[0]?.id).toBe('item-1')
      expect(state.postedIds['source-1']?.[0]?.postedAt).toBeDefined()
      expect(state.postedIds['source-1']?.[1]?.id).toBe('item-2')
      expect(state.postedIds['source-1']?.[2]?.id).toBe('item-3')
    })

    test('handles empty postedIds object', () => {
      const existingState = {
        lastRun: null,
        postedIds: {},
        lastSeen: {},
      }
      writeState(existingState)

      const state = loadState()

      expect(state.postedIds).toEqual({})
    })
  })

  describe('saveState', () => {
    test('creates data directory if it does not exist', () => {
      if (fs.existsSync(dataDir)) {
        fs.rmSync(dataDir, { recursive: true })
      }

      const state = {
        lastRun: '2024-01-01T00:00:00.000Z',
        postedIds: {},
        lastSeen: {},
      }

      saveState(state)

      expect(fs.existsSync(dataDir)).toBe(true)
      expect(fs.existsSync(statePath)).toBe(true)
    })

    test('creates nested state.json file', () => {
      deleteState()
      if (fs.existsSync(dataDir)) {
        fs.rmSync(dataDir, { recursive: true })
      }

      const state = {
        lastRun: '2024-01-01T00:00:00.000Z',
        postedIds: {},
        lastSeen: {},
      }

      saveState(state)

      expect(fs.existsSync(statePath)).toBe(true)
    })

    test('writes state to file', () => {
      const state = {
        lastRun: '2024-01-01T00:00:00.000Z',
        postedIds: {
          'source-1': [{ id: 'item-1', postedAt: '2024-01-01T00:00:00.000Z' }],
        },
        lastSeen: {
          'source-1': 'item-1',
        },
      }

      saveState(state)

      const savedState = readStateFile()
      expect(savedState).not.toBeNull()
      expect(savedState!.lastRun).toBe('2024-01-01T00:00:00.000Z')
    })

    test('overwrites existing state file', () => {
      const initialState = {
        lastRun: '2024-01-01T00:00:00.000Z',
        postedIds: {},
        lastSeen: {},
      }
      writeState(initialState)

      const newState = {
        lastRun: '2024-01-02T00:00:00.000Z',
        postedIds: {
          'source-1': [{ id: 'new-item', postedAt: '2024-01-02T00:00:00.000Z' }],
        },
        lastSeen: {
          'source-1': 'new-item',
        },
      }

      saveState(newState)

      const savedState = readStateFile()
      expect(savedState!.lastRun).toBe('2024-01-02T00:00:00.000Z')
    })
  })

  describe('isNewItem', () => {
    test('returns true for item not in postedIds', () => {
      const state = loadState()

      const result = isNewItem('new-item', 'source-1', state)

      expect(result).toBe(true)
    })

    test('returns false for item already in postedIds', () => {
      const state = {
        lastRun: null,
        postedIds: {
          'source-1': [{ id: 'existing-item', postedAt: '2024-01-01T00:00:00.000Z' }],
        },
        lastSeen: {},
      }

      const result = isNewItem('existing-item', 'source-1', state)

      expect(result).toBe(false)
    })

    test('returns true for item in different source', () => {
      const state = {
        lastRun: null,
        postedIds: {
          'source-1': [{ id: 'existing-item', postedAt: '2024-01-01T00:00:00.000Z' }],
        },
        lastSeen: {},
      }

      const result = isNewItem('existing-item', 'source-2', state)

      expect(result).toBe(true)
    })

    test('handles missing source in postedIds', () => {
      const state = {
        lastRun: null,
        postedIds: {},
        lastSeen: {},
      }

      const result = isNewItem('any-item', 'non-existent-source', state)

      expect(result).toBe(true)
    })

    test('handles empty postedIds array for source', () => {
      const state = {
        lastRun: null,
        postedIds: {
          'source-1': [],
        },
        lastSeen: {},
      }

      const result = isNewItem('any-item', 'source-1', state)

      expect(result).toBe(true)
    })
  })

  describe('markPosted', () => {
    test('adds item to postedIds', () => {
      const state = loadState()

      markPosted('item-1', 'source-1', state)

      expect(state.postedIds['source-1']).toHaveLength(1)
      expect(state.postedIds['source-1']?.[0]?.id).toBe('item-1')
    })

    test('updates lastSeen for source', () => {
      const state = loadState()

      markPosted('item-1', 'source-1', state)

      expect(state.lastSeen['source-1']).toBe('item-1')
    })

    test('updates lastRun timestamp', () => {
      const state = loadState()

      markPosted('item-1', 'source-1', state)

      expect(state.lastRun).not.toBeNull()
    })

    test('appends to existing postedIds array', () => {
      const state = {
        lastRun: null,
        postedIds: {
          'source-1': [{ id: 'item-1', postedAt: '2024-01-01T00:00:00.000Z' }],
        },
        lastSeen: {},
      }

      markPosted('item-2', 'source-1', state)

      expect(state.postedIds['source-1']).toHaveLength(2)
      expect(state.postedIds['source-1']?.[1]?.id).toBe('item-2')
    })

    test('creates postedIds array for new source', () => {
      const state: State = {
        lastRun: null,
        postedIds: {},
        lastSeen: {},
      }

      markPosted('item-1', 'new-source', state)

      expect(state.postedIds['new-source']).toBeDefined()
      expect(state.postedIds['new-source']!).toHaveLength(1)
    })

    test('sets postedAt to current timestamp', () => {
      const state = loadState()
      const beforeTime = new Date()

      markPosted('item-1', 'source-1', state)

      const postedAt = new Date(state.postedIds['source-1']?.[0]?.postedAt ?? '')
      expect(postedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime())
    })

    test('updates lastSeen to most recent item', () => {
      const state = loadState()

      markPosted('item-1', 'source-1', state)
      markPosted('item-2', 'source-1', state)

      expect(state.lastSeen['source-1']).toBe('item-2')
    })
  })

  describe('ID pruning', () => {
    test('removes items older than 30 days on load', () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      const recentDate = new Date().toISOString()
      const state = {
        lastRun: null,
        postedIds: {
          'source-1': [
            { id: 'old-item', postedAt: oldDate },
            { id: 'recent-item', postedAt: recentDate },
          ],
        },
        lastSeen: {},
      }
      writeState(state)

      const loadedState = loadState()

      expect(loadedState.postedIds['source-1']).toHaveLength(1)
      expect(loadedState.postedIds['source-1']?.[0]?.id).toBe('recent-item')
    })

    test('removes items older than 30 days on save', () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      const recentDate = new Date().toISOString()
      const state: State = {
        lastRun: null,
        postedIds: {
          'source-1': [
            { id: 'old-item', postedAt: oldDate },
            { id: 'recent-item', postedAt: recentDate },
          ],
        },
        lastSeen: {},
      }

      saveState(state)

      const savedState = readStateFile()
      expect(savedState!.postedIds['source-1']).toHaveLength(1)
    })

    test('keeps items exactly 30 days old', () => {
      const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString()
      const state: State = {
        lastRun: null,
        postedIds: {
          'source-1': [{ id: 'old-item', postedAt: thirtyDaysAgo }],
        },
        lastSeen: {},
      }
      writeState(state)

      const loadedState = loadState()

      expect(loadedState.postedIds['source-1']).toHaveLength(1)
    })
  })

  describe('max 100 IDs per source limit', () => {
    test('limits postedIds to 100 items on save', () => {
      const items = Array.from({ length: 150 }, (_, i) => ({
        id: `item-${i}`,
        postedAt: new Date().toISOString(),
      }))
      const state = {
        lastRun: null,
        postedIds: {
          'source-1': items,
        },
        lastSeen: {},
      }

      saveState(state)

      const savedState = readStateFile()!
      expect(savedState.postedIds['source-1']).toHaveLength(100)
    })

    test('keeps most recent 100 items', () => {
      const items = Array.from({ length: 150 }, (_, i) => ({
        id: `item-${i}`,
        postedAt: new Date(Date.now() + i).toISOString(),
      }))
      const state = {
        lastRun: null,
        postedIds: {
          'source-1': items,
        },
        lastSeen: {},
      }

      saveState(state)

      const savedState = readStateFile()!
      const savedIds = savedState.postedIds['source-1']!.map((item) => item.id)
      expect(savedIds).toContain('item-149')
      expect(savedIds).toContain('item-50')
    })

    test('does not modify state with fewer than 100 items', () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        id: `item-${i}`,
        postedAt: new Date().toISOString(),
      }))
      const state = {
        lastRun: null,
        postedIds: {
          'source-1': items,
        },
        lastSeen: {},
      }

      saveState(state)

      const savedState = readStateFile()
      expect(savedState!.postedIds['source-1']).toHaveLength(50)
    })

    test('limits each source independently', () => {
      const items1 = Array.from({ length: 150 }, (_, i) => ({
        id: `item-${i}`,
        postedAt: new Date().toISOString(),
      }))
      const items2 = Array.from({ length: 80 }, (_, i) => ({
        id: `other-${i}`,
        postedAt: new Date().toISOString(),
      }))
      const state = {
        lastRun: null,
        postedIds: {
          'source-1': items1,
          'source-2': items2,
        },
        lastSeen: {},
      }

      saveState(state)

      const savedState = readStateFile()
      expect(savedState!.postedIds['source-1']).toHaveLength(100)
      expect(savedState!.postedIds['source-2']).toHaveLength(80)
    })
  })

  describe('legacy state migration', () => {
    test('converts string[] to PostedId[] with current timestamp', () => {
      const legacyState = {
        lastRun: '2024-01-01T00:00:00.000Z',
        postedIds: {
          'source-1': ['item-1', 'item-2'],
        },
        lastSeen: {
          'source-1': 'item-2',
        },
      }
      writeState(legacyState)

      const state = loadState()

      expect(state.postedIds['source-1']).toHaveLength(2)
      expect(state.postedIds['source-1']?.[0]?.id).toBe('item-1')
      expect(state.postedIds['source-1']?.[0]?.postedAt).toBeDefined()
      expect(state.postedIds['source-1']?.[1]?.id).toBe('item-2')
      expect(state.postedIds['source-1']?.[1]?.postedAt).toBeDefined()
    })

    test('preserves lastRun after migration', () => {
      const legacyState = {
        lastRun: '2024-01-01T00:00:00.000Z',
        postedIds: {
          'source-1': ['item-1'],
        },
        lastSeen: {},
      }
      writeState(legacyState)

      const state = loadState()

      expect(state.lastRun).toBe('2024-01-01T00:00:00.000Z')
    })

    test('preserves lastSeen after migration', () => {
      const legacyState = {
        lastRun: '2024-01-01T00:00:00.000Z',
        postedIds: {
          'source-1': ['item-1', 'item-2'],
        },
        lastSeen: {
          'source-1': 'item-2',
        },
      }
      writeState(legacyState)

      const state = loadState()

      expect(state.lastSeen['source-1']).toBe('item-2')
    })

    test('handles multiple sources in legacy format', () => {
      const legacyState = {
        lastRun: null,
        postedIds: {
          'source-1': ['item-1', 'item-2'],
          'source-2': ['item-3'],
          'source-3': [],
        },
        lastSeen: {},
      }
      writeState(legacyState)

      const state = loadState()

      expect(state.postedIds['source-1']).toHaveLength(2)
      expect(state.postedIds['source-2']).toHaveLength(1)
      expect(state.postedIds['source-3']).toHaveLength(0)
    })

    test('handles empty postedIds in legacy format', () => {
      const legacyState = {
        lastRun: null,
        postedIds: {},
        lastSeen: {},
      }
      writeState(legacyState)

      const state = loadState()

      expect(state.postedIds).toEqual({})
    })
  })

  describe('integration tests', () => {
    test('full workflow: load, mark posted, check isNew, save', () => {
      const state = loadState()

      expect(isNewItem('item-1', 'source-1', state)).toBe(true)

      markPosted('item-1', 'source-1', state)

      expect(isNewItem('item-1', 'source-1', state)).toBe(false)
      expect(isNewItem('item-2', 'source-1', state)).toBe(true)

      saveState(state)

      const reloadedState = loadState()

      expect(isNewItem('item-1', 'source-1', reloadedState)).toBe(false)
      expect(isNewItem('item-2', 'source-1', reloadedState)).toBe(true)
    })

    test('persistence across multiple load/save cycles', () => {
      const state1 = loadState()
      markPosted('item-1', 'source-1', state1)
      saveState(state1)

      const state2 = loadState()
      markPosted('item-2', 'source-1', state2)
      markPosted('item-1', 'source-2', state2)
      saveState(state2)

      const state3 = loadState()
      expect(isNewItem('item-1', 'source-1', state3)).toBe(false)
      expect(isNewItem('item-2', 'source-1', state3)).toBe(false)
      expect(isNewItem('item-1', 'source-2', state3)).toBe(false)
      expect(state3.postedIds['source-1']).toHaveLength(2)
    })

    test('pruning removes old items but keeps new ones', () => {
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()
      const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

      const state: State = {
        lastRun: null,
        postedIds: {
          'source-1': [
            { id: 'old-1', postedAt: oldDate },
            { id: 'old-2', postedAt: oldDate },
            { id: 'recent-1', postedAt: recentDate },
            { id: 'recent-2', postedAt: recentDate },
          ],
        },
        lastSeen: {},
      }
      writeState(state)

      markPosted('new-item', 'source-1', state)
      saveState(state)

      const loaded = loadState()

      expect(loaded.postedIds['source-1']!.find((i) => i.id === 'old-1')).toBeUndefined()
      expect(loaded.postedIds['source-1']!.find((i) => i.id === 'old-2')).toBeUndefined()
      expect(loaded.postedIds['source-1']!.find((i) => i.id === 'recent-1')).toBeDefined()
      expect(loaded.postedIds['source-1']!.find((i) => i.id === 'recent-2')).toBeDefined()
      expect(loaded.postedIds['source-1']!.find((i) => i.id === 'new-item')).toBeDefined()
    })
  })
})
