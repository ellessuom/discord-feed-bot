import { toHttpError } from './utils/http-error'

// The Worker's D1 database (worker/wrangler.toml). Identifiers, not secrets.
const ACCOUNT_ID = 'c66941709cd035764d42966a0e89d3f2'
const DATABASE_ID = '21fe060c-591b-4f64-a7c3-156956dea5fd'
const QUERY_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`

/**
 * Runs one statement against D1 over Cloudflare's REST API. Returns null when
 * CF_D1_TOKEN is unset (local runs), so callers fall back to pre-D1 behaviour.
 * Steam links and libraries are private: never copy query results into data/.
 */
export async function d1Query<T>(sql: string, params: string[] = []): Promise<T[] | null> {
  const token = process.env.CF_D1_TOKEN
  if (!token) return null

  const response = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  })
  if (!response.ok) throw await toHttpError(response)
  const body = (await response.json()) as {
    success: boolean
    errors?: { message: string }[]
    result?: { results?: T[] }[]
  }
  if (!body.success) throw new Error(`D1: ${body.errors?.map((e) => e.message).join('; ')}`)
  return body.result?.[0]?.results ?? []
}
