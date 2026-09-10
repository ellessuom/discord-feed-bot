import { describe, test, expect, vi } from 'vitest'
import { withRetry } from '../../utils/retry'
import { HttpError, parseRetryAfter } from '../../utils/http-error'

describe('parseRetryAfter', () => {
  test('reads Discord fractional seconds as milliseconds', () => {
    expect(parseRetryAfter(new Headers({ 'retry-after': '1.5' }))).toBe(1500)
  })

  test('returns undefined when the header is absent (as on Steam 429s)', () => {
    expect(parseRetryAfter(new Headers())).toBeUndefined()
  })

  test('ignores a nonsense header rather than waiting forever', () => {
    expect(parseRetryAfter(new Headers({ 'retry-after': 'soon' }))).toBeUndefined()
  })
})

describe('withRetry', () => {
  test('gives up immediately on a non-retryable 4xx', async () => {
    // A 400 will fail identically on every attempt; retrying just wastes rate budget.
    const fn = vi.fn(async () => {
      throw new HttpError(400, 'Bad Request', 'bad appids')
    })

    await expect(withRetry(fn, { retries: 3, baseDelayMs: 1 })).rejects.toThrow('HTTP 400')
    expect(fn).toHaveBeenCalledOnce()
  })

  test('retries a 429 and succeeds', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls === 1) throw new HttpError(429, 'Too Many Requests', '', 5)
      return 'ok'
    })

    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1, maxDelayMs: 10 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('waits at least as long as Retry-After asks', async () => {
    const fn = vi.fn(async () => {
      throw new HttpError(429, 'Too Many Requests', '', 60)
    })

    const started = Date.now()
    await expect(withRetry(fn, { retries: 1, baseDelayMs: 1, maxDelayMs: 1 })).rejects.toThrow()
    // baseDelayMs of 1ms must not override the server's 60ms instruction.
    expect(Date.now() - started).toBeGreaterThanOrEqual(50)
  })

  test('still retries plain errors that carry no status', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 3) throw new Error('network blip')
      return 'recovered'
    })

    await expect(withRetry(fn, { retries: 3, baseDelayMs: 1 })).resolves.toBe('recovered')
  })
})
