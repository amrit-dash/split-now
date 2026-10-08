import { describe, expect, it } from 'vitest'
import { APP_NAME, pageTitle } from './brand'

describe('pageTitle', () => {
  it('suffixes the app name and falls back to it alone', () => {
    expect(pageTitle('Groups')).toBe(`Groups · ${APP_NAME}`)
    expect(pageTitle('  Goa trip ')).toBe(`Goa trip · ${APP_NAME}`)
    expect(pageTitle('')).toBe(APP_NAME)
    expect(pageTitle(null)).toBe(APP_NAME)
    expect(pageTitle(undefined)).toBe(APP_NAME)
  })
})
