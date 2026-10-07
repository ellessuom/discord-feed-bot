import fs from 'node:fs'
import path from 'node:path'
import { projectRoot } from './paths'
import { toHttpError } from './utils/http-error'

// The Worker's D1 database (worker/wrangler.toml). Identifiers, not secrets.
const ACCOUNT_ID = 'c66941709cd035764d42966a0e89d3f2'
const DATABASE_ID = '21fe060c-591b-4f64-a7c3-156956dea5fd'
const QUERY_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`

export interface D1Statement {
  sql: string
  params?: string[]
}

/** null when CF_D1_TOKEN is unset (local runs). */
async function d1Request(body: unknown): Promise<{ results?: unknown[] }[] | null> {
  const token = process.env.CF_D1_TOKEN
  if (!token) return null

  const response = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await toHttpError(response)
  const json = (await response.json()) as {
    success: boolean
    errors?: { message: string }[]
    result?: { results?: unknown[] }[]
  }
  if (!json.success) throw new Error(`D1: ${json.errors?.map((e) => e.message).join('; ')}`)
  return json.result ?? []
}

/**
 * Runs one statement against D1 over Cloudflare's REST API. Returns null when
 * CF_D1_TOKEN is unset (local runs), so callers fall back to pre-D1 behaviour.
 * Steam links and libraries are private: never copy query results into data/.
 */
export async function d1Query<T>(sql: string, params: string[] = []): Promise<T[] | null> {
  const result = await d1Request({ sql, params })
  return result ? ((result[0]?.results ?? []) as T[]) : null
}

/** Several statements in one HTTP call; returns each statement's rows. */
export async function d1Batch(statements: D1Statement[]): Promise<unknown[][] | null> {
  if (statements.length === 0) return []
  const result = await d1Request({ batch: statements })
  return result ? result.map((r) => r.results ?? []) : null
}

/** worker/schema.sql split into statements, comments removed. */
export function schemaStatements(): string[] {
  const sql = fs.readFileSync(path.resolve(projectRoot, 'worker/schema.sql'), 'utf8')
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Creates any missing table. Safe to run every time because schema.sql is
 * additive only (CREATE … IF NOT EXISTS, enforced by a test), so this can never
 * alter or drop existing data.
 */
export async function ensureSchema(): Promise<void> {
  await d1Batch(schemaStatements().map((sql) => ({ sql })))
}
