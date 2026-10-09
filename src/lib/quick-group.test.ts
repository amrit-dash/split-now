import { describe, expect, it } from 'vitest'
import { groupInText, type NamedGroup } from './quick-group'

const groups: NamedGroup[] = [
  { id: 'goa', name: 'Goa trip 🏖️' },
  { id: 'flat', name: 'The Flat' },
  { id: 'office', name: 'Office lunches' },
]

describe('groupInText: naming an existing group', () => {
  it('finds a group after "in", and leaves the rest of the line', () => {
    expect(groupInText('dinner 1200 in Goa trip', groups)).toEqual({ kind: 'match', id: 'goa', text: 'dinner 1200', phrase: 'in goa trip' })
  })
  it('one word of the name, any case, is enough', () => {
    expect(groupInText('dinner 1200 in goa with Rahul', groups)).toMatchObject({ kind: 'match', id: 'goa', text: 'dinner 1200 with Rahul' })
    expect(groupInText('cab 300 for flat', groups)).toMatchObject({ kind: 'match', id: 'flat', text: 'cab 300' })
    expect(groupInText('lunch 250 into office', groups)).toMatchObject({ kind: 'match', id: 'office', text: 'lunch 250' })
  })
  it('reads "@name" without a marker word', () => {
    expect(groupInText('@Goa dinner 1200', groups)).toMatchObject({ kind: 'match', id: 'goa', text: 'dinner 1200' })
    expect(groupInText('dinner 1200 @goa, I paid', groups)).toMatchObject({ kind: 'match', id: 'goa', text: 'dinner 1200, I paid' })
  })
  it('takes a prefix of 3+ letters, but not shorter', () => {
    expect(groupInText('chai 40 in off', groups)).toMatchObject({ kind: 'match', id: 'office' })
    expect(groupInText('chai 40 in of', groups)).toEqual({ kind: 'none' })
  })
  it('skips "the", "our", "my" and takes a trailing "group" with it', () => {
    expect(groupInText('rent 20000 for the flat group', groups)).toMatchObject({ kind: 'match', id: 'flat', text: 'rent 20000' })
    expect(groupInText('snacks 90 in our goa trip group, Priya paid', groups)).toMatchObject({ kind: 'match', id: 'goa', text: 'snacks 90, Priya paid' })
  })
  it('needs whole words: a name inside another word does not count', () => {
    expect(groupInText('dinner in goan restaurant', [{ id: 'g', name: 'Goan' }])).toMatchObject({ kind: 'match', id: 'g' })
    expect(groupInText('dinner in goan restaurant', [{ id: 'g', name: 'Go' }])).toEqual({ kind: 'none' })
  })
  it('without a marker, a group name in the line is just words', () => {
    expect(groupInText('flat white 180', groups)).toEqual({ kind: 'none' })
    expect(groupInText('goa trip dinner 1200', groups)).toEqual({ kind: 'none' })
  })
  it('"for" a person is not a group', () => {
    const g = [{ id: 'r', name: 'Rahul & me' }]
    expect(groupInText('lunch 500 for Rahul', g, ['Rahul Sharma', 'Priya'])).toEqual({ kind: 'none' })
    expect(groupInText('lunch 500 for Rahul', g)).toMatchObject({ kind: 'match', id: 'r' })
    expect(groupInText('lunch 500 in Rahul', g, ['Rahul Sharma'])).toMatchObject({ kind: 'match', id: 'r' })
    expect(groupInText('lunch 500 for me', [{ id: 'm', name: 'Me and Asha' }])).toEqual({ kind: 'none' })
  })
  it('the better fit wins: more words, the whole name, exact over a prefix', () => {
    const g = [
      { id: 'goa', name: 'Goa' },
      { id: 'goa-trip', name: 'Goa trip' },
    ]
    expect(groupInText('dinner in goa', g)).toMatchObject({ kind: 'match', id: 'goa' })
    expect(groupInText('dinner in goa trip', g)).toMatchObject({ kind: 'match', id: 'goa-trip' })
  })
  it('two groups that fit equally are ambiguous', () => {
    const g = [
      { id: 'a', name: 'Goa 2025' },
      { id: 'b', name: 'Goa 2026' },
    ]
    expect(groupInText('dinner 1200 in goa', g)).toEqual({ kind: 'ambiguous', ids: ['a', 'b'], text: 'dinner 1200', phrase: 'in goa' })
    expect(groupInText('dinner 1200 in goa 2026', g)).toMatchObject({ kind: 'match', id: 'b' })
  })
  it('a comma ends the phrase', () => {
    expect(groupInText('dinner in, goa', groups)).toEqual({ kind: 'none' })
  })
  it('no groups, no words: nothing', () => {
    expect(groupInText('dinner 1200 in Goa', [])).toEqual({ kind: 'none' })
    expect(groupInText('', groups)).toEqual({ kind: 'none' })
  })
})

describe('groupInText: a new group', () => {
  it('"in a new group Bali trip" names the group to create', () => {
    expect(groupInText('dinner 1200 in a new group Bali trip', groups)).toEqual({
      kind: 'new',
      name: 'Bali trip',
      text: 'dinner 1200',
      phrase: 'in a new group bali trip',
    })
  })
  it('the name stops at people, payer, day words, numbers and commas', () => {
    expect(groupInText('new group bali dinner 1200 with Rahul', groups)).toMatchObject({ kind: 'new', name: 'Bali dinner', text: '1200 with Rahul' })
    expect(groupInText('dinner in new group Bali, I paid 1200', groups)).toMatchObject({ kind: 'new', name: 'Bali', text: 'dinner, I paid 1200' })
    expect(groupInText('cab 400 new group called Bali yesterday', groups)).toMatchObject({ kind: 'new', name: 'Bali', text: 'cab 400 yesterday' })
    expect(groupInText('in a new group one two three four five', groups)).toMatchObject({ kind: 'new', name: 'One two three four', text: 'five' })
  })
  it('wins over an existing group with the same words, and works with no name', () => {
    expect(groupInText('dinner in a new group Goa trip', groups)).toMatchObject({ kind: 'new', name: 'Goa trip' })
    expect(groupInText('dinner 300 in a new group', groups)).toMatchObject({ kind: 'new', name: '', text: 'dinner 300' })
  })
  it('"new" alone is not a marker', () => {
    expect(groupInText('new shoes 2000', groups)).toEqual({ kind: 'none' })
  })
})
