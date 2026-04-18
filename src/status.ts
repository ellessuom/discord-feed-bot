import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const statusPath = path.resolve(projectRoot, 'data', 'status.json')

const MAX_ERRORS = 20

export interface StatusError {
  source: string
  message: string
  time: string
}

export interface Status {
  lastRun: string | null
  success: boolean
  postsCount: number
  sourcesCount: number
  errors: StatusError[]
  nextRun: string | null
}

export function loadStatus(): Status {
  if (!fs.existsSync(statusPath)) {
    return {
      lastRun: null,
      success: true,
      postsCount: 0,
      sourcesCount: 0,
      errors: [],
      nextRun: null,
    }
  }

  const content = fs.readFileSync(statusPath, 'utf-8')
  let raw: Partial<Status>
  try {
    raw = JSON.parse(content) as Partial<Status>
  } catch {
    console.warn('Invalid status.json; resetting to default status')
    return {
      lastRun: null,
      success: true,
      postsCount: 0,
      sourcesCount: 0,
      errors: [],
      nextRun: null,
    }
  }

  return {
    lastRun: raw.lastRun ?? null,
    success: raw.success ?? true,
    postsCount: raw.postsCount ?? 0,
    sourcesCount: raw.sourcesCount ?? 0,
    errors: raw.errors ?? [],
    nextRun: raw.nextRun ?? null,
  }
}

export function saveStatus(status: Status): void {
  if (status.errors.length > MAX_ERRORS) {
    status.errors = status.errors.slice(-MAX_ERRORS)
  }

  const dataDir = path.dirname(statusPath)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2))
}

export function calculateNextRun(lastRun: string | null): string | null {
  if (!lastRun) return null

  const last = new Date(lastRun)
  const next = new Date(last.getTime() + 60 * 60 * 1000)
  return next.toISOString()
}
