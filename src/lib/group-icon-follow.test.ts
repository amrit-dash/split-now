import { describe, expect, it } from 'vitest'
import { iconFollowsName } from './group-icon-follow'

const base = { editing: false, renamed: false, iconTouched: false, iconChosen: false, hasPicture: false }

describe('a group’s icon follows its name', () => {
  it('a new group: until an icon is chosen', () => {
    expect(iconFollowsName(base)).toBe(true)
    expect(iconFollowsName({ ...base, iconTouched: true })).toBe(false)
  })
  it('a saved group: once renamed, until an icon is chosen here, never over a picture', () => {
    const edit = { ...base, editing: true, iconTouched: true }
    expect(iconFollowsName(edit)).toBe(false)
    expect(iconFollowsName({ ...edit, renamed: true })).toBe(true)
    expect(iconFollowsName({ ...edit, renamed: true, iconChosen: true })).toBe(false)
    expect(iconFollowsName({ ...edit, renamed: true, hasPicture: true })).toBe(false)
  })
})
