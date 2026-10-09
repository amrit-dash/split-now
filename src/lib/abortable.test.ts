import { describe, expect, it } from 'vitest'
import { abortable, abortReason, isAbortError, throwIfAborted } from './abortable'

const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('abortable', () => {
  it('passes the promise through without a signal', async () => {
    await expect(abortable(Promise.resolve(3), undefined)).resolves.toBe(3)
  })

  it('resolves and rejects with the work when the signal never fires', async () => {
    const c = new AbortController()
    await expect(abortable(Promise.resolve('ok'), c.signal)).resolves.toBe('ok')
    await expect(abortable(Promise.reject(new Error('boom')), c.signal)).rejects.toThrow('boom')
  })

  it('rejects at once when the signal fires first, and ignores the late answer', async () => {
    const c = new AbortController()
    const d = deferred<number>()
    const p = abortable(d.promise, c.signal)
    c.abort()
    await expect(p).rejects.toSatisfy(isAbortError)
    d.resolve(1)
    await expect(p).rejects.toSatisfy(isAbortError)
  })

  it('swallows a late rejection of aborted work', async () => {
    const c = new AbortController()
    const d = deferred<number>()
    const p = abortable(d.promise, c.signal)
    c.abort()
    d.reject(new Error('late'))
    await expect(p).rejects.toSatisfy(isAbortError)
  })

  it('rejects straight away for an already aborted signal', async () => {
    const c = new AbortController()
    c.abort()
    await expect(abortable(new Promise(() => {}), c.signal)).rejects.toSatisfy(isAbortError)
  })

  it('uses an Error reason as given', async () => {
    const c = new AbortController()
    const why = new Error('left the screen')
    c.abort(why)
    await expect(abortable(new Promise(() => {}), c.signal)).rejects.toBe(why)
  })
})

describe('abortReason / isAbortError / throwIfAborted', () => {
  it('wraps a non-Error reason in an AbortError', () => {
    const c = new AbortController()
    c.abort('nope')
    const e = abortReason(c.signal)
    expect(e.name).toBe('AbortError')
  })
  it('recognises abort errors only', () => {
    const c = new AbortController()
    c.abort()
    expect(isAbortError(abortReason(c.signal))).toBe(true)
    expect(isAbortError(new Error('x'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
  })
  it('throws only once aborted', () => {
    const c = new AbortController()
    expect(() => throwIfAborted(undefined)).not.toThrow()
    expect(() => throwIfAborted(c.signal)).not.toThrow()
    c.abort()
    expect(() => throwIfAborted(c.signal)).toThrow()
  })
})
