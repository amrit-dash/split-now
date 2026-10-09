import { describe, expect, it } from 'vitest'
import { DEPLOY_ENV, missingDeployEnv } from './deploy-env'

describe('missingDeployEnv', () => {
  const full = Object.fromEntries(DEPLOY_ENV.map((k) => [k, 'x']))
  it('is empty when the whole Firebase web config is there', () => {
    expect(missingDeployEnv(full)).toEqual([])
  })
  it('names what is missing or blank', () => {
    expect(missingDeployEnv({ ...full, VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_APP_ID: '  ' })).toEqual(['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_APP_ID'])
    expect(missingDeployEnv({})).toEqual([...DEPLOY_ENV])
  })
})
