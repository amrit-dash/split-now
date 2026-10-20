import { describe, expect, it } from 'vitest'
import { bannerShown, getUpdate, profileRowShown, putUpdateOff, setUpdateReady, subscribeUpdate } from './app-update'

describe('a waiting update', () => {
  it('the banner offers it until Later; Profile keeps offering it', () => {
    let calls = 0
    const off = subscribeUpdate(() => calls++)
    expect(bannerShown(getUpdate())).toBe(false)
    setUpdateReady(true)
    expect(bannerShown(getUpdate())).toBe(true)
    expect(profileRowShown(getUpdate())).toBe(true)
    putUpdateOff()
    expect(bannerShown(getUpdate())).toBe(false)
    expect(profileRowShown(getUpdate())).toBe(true)
    // nothing waiting any more: neither, and the next one shows the banner again
    setUpdateReady(false)
    expect(profileRowShown(getUpdate())).toBe(false)
    setUpdateReady(true)
    expect(bannerShown(getUpdate())).toBe(true)
    expect(calls).toBe(4)
    off()
  })
})
