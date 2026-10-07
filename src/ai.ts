/**
 * OpenAI calls and the spend meter, shared by the Actions jobs and the Worker's /ask.
 * The Worker bundles this file, so it stays platform-neutral: no `node:` imports, no
 * `process`, and never `./d1` (which reads files). Each side passes its own `Sql`.
 */

const MODEL = 'gpt-6-luna'
// USD, gpt-6-luna standard tier (2026-10). Cached input is metered as full input, so
// the meter errs high; every web_search_call item (search, open_page…) is one call.
const PER_INPUT_TOKEN = 0.1 / 1e6
const PER_OUTPUT_TOKEN = 0.5 / 1e6
const PER_SEARCH = 0.01

/** Everything AI, per calendar month (UTC). OpenAI's $2 hard limit is the backstop. */
export const MONTH_USD = 1.8
export const ASK_MONTH_USD = 1.5
/** So a launch-day frenzy can't eat the month. */
export const ASK_DAY_USD = 0.25
export const ASK_PER_PERSON_DAY = 5
/** Held per question before OpenAI is called (worst case ≈ $0.022), settled after. */
export const ASK_RESERVE_USD = 0.03

/** D1 REST binds every param as a string: compare numbers in JS, never in SQL. */
export type Sql = (sql: string, params: string[]) => Promise<Record<string, unknown>[]>

export interface AiResult {
  text: string
  usd: number
  /** Up to 2 cited pages, for code to show; the model's own links are stripped. */
  sources: string[]
}

interface ResponseBody {
  output?: {
    type: string
    content?: { type: string; text?: string; annotations?: { type: string; url?: string }[] }[]
  }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

export function readResponse(body: ResponseBody): AiResult {
  const output = body.output ?? []
  const parts = output
    .flatMap((item) => (item.type === 'message' ? (item.content ?? []) : []))
    .filter((part) => part.type === 'output_text')
  const cited = parts
    .flatMap((part) => part.annotations ?? [])
    .flatMap((a) => (a.type === 'url_citation' && a.url ? [a.url] : []))
    .map((url) => url.replace(/[?&]utm_source=openai$/, ''))
    // Shown inside <…> in Discord, so nothing that could close it or span lines.
    .filter((url) => /^https:\/\/[^\s<>]+$/.test(url) && url.length <= 200)
  const searches = output.filter((item) => item.type === 'web_search_call').length
  return {
    text: parts.map((part) => part.text ?? '').join(''),
    usd:
      (body.usage?.input_tokens ?? 0) * PER_INPUT_TOKEN +
      (body.usage?.output_tokens ?? 0) * PER_OUTPUT_TOKEN +
      searches * PER_SEARCH,
    sources: [...new Set(cited)].slice(0, 2),
  }
}

/** One Responses API call. `store: false`: OpenAI keeps nothing for later retrieval. */
export async function respond(
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<AiResult> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, store: false, reasoning: { effort: 'none' }, ...body }),
    signal: signal ?? null,
  })
  // Status only: an error body can echo the prompt, and Actions logs are public.
  if (!response.ok) throw new Error(`OpenAI failed: HTTP ${response.status}`)
  return readResponse((await response.json()) as ResponseBody)
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export type Refusal = 'person' | 'day' | 'month'

/**
 * Holds ASK_RESERVE_USD for one question, or says why not. A crash, a timeout or a
 * bill after an abort is therefore already counted. D1 errors throw: fail closed.
 * ponytail: read-then-write, so two questions in the same instant can both pass;
 * the overrun is one reservation, and OpenAI's hard limit is the backstop.
 */
export async function reserve(sql: Sql, who: string, now: number): Promise<Refusal | null> {
  const today = utcDay(now)
  const [row = {}] = await sql(
    `SELECT COALESCE(SUM(usd), 0) AS month,
       COALESCE(SUM(CASE WHEN kind = 'ask' THEN usd END), 0) AS ask_month,
       COALESCE(SUM(CASE WHEN kind = 'ask' AND day = ?2 THEN usd END), 0) AS ask_day,
       COALESCE(SUM(CASE WHEN kind = 'ask' AND day = ?2 AND who = ?3 THEN calls END), 0) AS mine
     FROM ai_spend WHERE day >= ?1`,
    [`${today.slice(0, 7)}-01`, today, who]
  )
  const n = (key: string) => Number(row[key] ?? 0)
  if (n('mine') >= ASK_PER_PERSON_DAY) return 'person'
  if (
    n('month') + ASK_RESERVE_USD > MONTH_USD ||
    n('ask_month') + ASK_RESERVE_USD > ASK_MONTH_USD
  ) {
    return 'month'
  }
  if (n('ask_day') + ASK_RESERVE_USD > ASK_DAY_USD) return 'day'
  await settle(sql, 'ask', who, ASK_RESERVE_USD, now, 1)
  return null
}

/** Adds to the meter; usd may be negative to release part of a reservation. */
export async function settle(
  sql: Sql,
  kind: string,
  who: string,
  usd: number,
  now: number,
  calls = 0
): Promise<void> {
  await sql(
    `INSERT INTO ai_spend (day, kind, who, usd, calls) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (day, kind, who) DO UPDATE SET
       usd = usd + excluded.usd, calls = calls + excluded.calls`,
    [utcDay(now), kind, who, String(usd), String(calls)]
  )
}

/** Cuts at the last line break that fits, so a message never ends mid-bullet. */
export function cap(text: string, max: number): string {
  if (text.length <= max) return text
  const lineEnd = text.lastIndexOf('\n', max)
  return lineEnd > max / 2
    ? text.slice(0, lineEnd).trimEnd()
    : `${text.slice(0, max - 1).trimEnd()}…`
}

/**
 * Model text → safe Discord text. Code decides every link, so all of the model's are
 * removed (a web page could plant a masked phishing link), along with mentions and
 * invites. Posts also send `allowed_mentions: {parse: []}`.
 */
export function sanitize(text: string, max: number): string {
  const clean = text
    .replace(/ ?\(\[[^\]]*\]\([^)]*\)\)/g, '') // inline citations: ([site](url))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // masked links keep their text
    .replace(/<?\b[a-z][a-z0-9+.-]*:\/\/[^\s>]+>?/gi, '') // any scheme, any case
    .replace(/\b(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+/gi, '')
    .replace(/<(?:@[!&]?|#)\d+>/g, '')
    .replace(/@(everyone|here)\b/gi, '$1')
    .replace(/[ \t]+$/gm, '')
    .trim()
  return cap(clean, max)
}
