export class HttpError extends Error {
  readonly status: number
  readonly retryAfterMs: number | undefined
  readonly body: string

  constructor(status: number, statusText: string, body: string, retryAfterMs?: number) {
    super(`HTTP ${status} ${statusText}${body ? `: ${body.slice(0, 200)}` : ''}`)
    this.name = 'HttpError'
    this.status = status
    this.body = body
    this.retryAfterMs = retryAfterMs
  }

  get isRateLimit(): boolean {
    return this.status === 429
  }

  /** 5xx and 429 are worth retrying; 4xx otherwise is a bug, not a blip. */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

/**
 * Discord sends `Retry-After` in seconds (may be fractional). Steam's 429 sends
 * nothing at all, in which case callers fall back to blind exponential backoff.
 */
export function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get('retry-after')
  if (!raw) return undefined
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return Math.ceil(seconds * 1000)
}

export async function toHttpError(response: Response): Promise<HttpError> {
  let body = ''
  try {
    body = await response.text()
  } catch {
    // body already consumed or unreadable; the status is the useful part
  }
  return new HttpError(
    response.status,
    response.statusText,
    body,
    parseRetryAfter(response.headers)
  )
}
