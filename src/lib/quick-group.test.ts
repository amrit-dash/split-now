import { describe, expect, it } from 'vitest'
import { oneOff, groupInText, lineFor, type NamedGroup } from './quick-group'

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

describe('lineFor: where the line goes', () => {
  const picked = groups[1]
  const at = (text: string, extra: { undone?: string; answered?: string } = {}) => lineFor({ text, named: groupInText(text, groups), groups, picked, ...extra })
  it('a named group wins over the picked one, and its words leave the line', () => {
    expect(at('dinner 1200 in Goa trip')).toMatchObject({ target: groups[0], line: 'dinner 1200', which: false, fresh: null })
  })
  it('tapped away, the line goes to the picked group as typed', () => {
    expect(at('dinner 1200 in Goa trip', { undone: 'in goa trip' })).toMatchObject({ target: picked, line: 'dinner 1200 in Goa trip', match: undefined })
  })
  it('nothing named: the picked group and the whole line', () => {
    expect(at('cab 300')).toMatchObject({ target: picked, line: 'cab 300', which: false })
  })
  it('a new group asked for', () => {
    expect(at('dinner 900 in a new group Bali trip').fresh).toMatchObject({ name: expect.stringMatching(/Bali/i) })
  })
  it('two groups fit: it asks which, until the person answers', () => {
    const two: NamedGroup[] = [
      { id: 'a', name: 'Goa trip' },
      { id: 'b', name: 'Goa office' },
    ]
    const named = groupInText('lunch 200 in goa', two)
    expect(lineFor({ text: 'lunch 200 in goa', named, groups: two, picked: two[0] }).which).toBe(true)
    const answered = lineFor({ text: 'lunch 200 in goa', named, groups: two, picked: two[1], answered: (named as { phrase: string }).phrase })
    expect(answered).toMatchObject({ which: false, target: two[1], line: 'lunch 200' })
  })
})

describe('a group named the way speech hears it', () => {
  const groups = [
    { id: 'k', name: 'Kodai Trip - Gandhi Birthday' },
    { id: 'a', name: 'Akash Agrawal' },
  ]
  it('one letter off, and “to the …”', () => {
    expect(groupInText('To the codai trip, lunch 600', groups)).toMatchObject({ kind: 'match', id: 'k' })
    expect(groupInText('lunch 600 in kodai', groups)).toMatchObject({ kind: 'match', id: 'k' })
  })
  it('“to” before a person is a person, not a group', () => {
    expect(groupInText('sent 500 to Akash', groups, ['Akash Agrawal'])).toEqual({ kind: 'none' })
  })
  it('oneOff: a letter changed, added or dropped, words of 4+ letters', () => {
    expect(oneOff('codai', 'kodai')).toBe(true)
    expect(oneOff('kodi', 'kodai')).toBe(true)
    expect(oneOff('kodaii', 'kodai')).toBe(true)
    expect(oneOff('goa', 'goo')).toBe(false)
    expect(oneOff('kerala', 'kodai')).toBe(false)
  })
})

describe('outside a group: a distinctive word of a group’s name picks it (owner, 24 Oct 2026)', () => {
  const groups = [
    { id: 'k', name: 'Kodai Trip - Gandhi Birthday', type: 'trip' },
    { id: 'g', name: 'Goa Trip', type: 'trip' },
    { id: 'a', name: 'Akash Agrawal', type: 'direct' },
    { id: 'f', name: 'Indiranagar Flat', type: 'home' },
  ]
  const loose = { loose: true }
  it('anywhere in the line, misheard or not, with its lead-in taken out', () => {
    expect(groupInText('when we were in Kodai on 3rd October I paid 1200 for lunch', groups, [], loose)).toMatchObject({ kind: 'match', id: 'k' })
    expect(groupInText('during the Kodai trip I paid 900 for the cab', groups, [], loose)).toMatchObject({
      kind: 'match',
      id: 'k',
      text: 'I paid 900 for the cab',
    })
    expect(groupInText('codai lunch 600', groups, [], loose)).toMatchObject({ kind: 'match', id: 'k' })
    expect(groupInText('indiranagar groceries 640', groups, [], loose)).toMatchObject({ kind: 'match', id: 'f' })
  })
  it('a common word alone never picks one ("the trip", "birthday dinner"), and a 1:1 is left to the people named', () => {
    expect(groupInText('dinner on the trip 900', groups, [], loose)).toEqual({ kind: 'none' })
    expect(groupInText('birthday dinner 900', groups, [], loose)).toEqual({ kind: 'none' })
    expect(groupInText('lunch with Akash 600', groups, ['Akash Agrawal'], loose)).toEqual({ kind: 'none' })
  })
  it('inside a group the line stays unless it names another one: "during the …", "in …"', () => {
    expect(groupInText('when we were at Kodai lunch 600', groups)).toEqual({ kind: 'none' })
    expect(groupInText('during the Kodai trip lunch 600', groups)).toMatchObject({ kind: 'match', id: 'k' })
    expect(groupInText('lunch 600 in Kodai', groups)).toMatchObject({ kind: 'match', id: 'k' })
  })
})
