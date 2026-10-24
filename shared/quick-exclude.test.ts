import { describe, expect, it } from 'vitest'
import { excludedPeople } from './quick-exclude'

const people = [
  { id: 'ar', name: 'Aradhana' },
  { id: 'sa', name: 'Sakshi' },
  { id: 'rs', name: 'Rahul Sharma' },
  { id: 'rv', name: 'Rahul Verma' },
  { id: 'dev', name: 'Dev' },
]

describe('excludedPeople', () => {
  it('reads a person left out in plain words (owner’s spoken line, 24 Oct 2026)', () => {
    expect(
      excludedPeople(
        'I paid for lunch on 3rd October for 1262 rupees. It was split by all but I remember Aradhana was not a part of that lunch. Split it equally amongst the rest.',
        people,
      ),
    ).toEqual(['ar'])
  })
  it('the usual ways of saying it', () => {
    expect(excludedPeople('dinner 1200, Sakshi didn’t come', people)).toEqual(['sa'])
    expect(excludedPeople('cab 300 leave Dev out', people)).toEqual(['dev'])
    expect(excludedPeople('lunch 900 everyone except Aradhana', people)).toEqual(['ar'])
    expect(excludedPeople('movie 600 without Sakshi and Dev', people)).toEqual(['sa', 'dev'])
    expect(excludedPeople('Dev skipped the dinner, 2000', people)).toEqual(['dev'])
  })
  it('a full name is that person; a first name two people share is nobody', () => {
    expect(excludedPeople('lunch 800, Rahul Verma wasn’t there', people)).toEqual(['rv'])
    expect(excludedPeople('lunch 800, Rahul wasn’t there', people)).toEqual([])
  })
  it('never about paying, and never someone just named', () => {
    expect(excludedPeople('Dev didn’t pay, I did, 500', people)).toEqual([])
    expect(excludedPeople('lunch 500 with Sakshi and Dev', people)).toEqual([])
    expect(excludedPeople('Sakshi paid 400 for lunch', people)).toEqual([])
  })
  it('the writer leaving themselves out, when given their id', () => {
    expect(excludedPeople('Priya paid 1500 for the cab, I wasn’t there', people, 'me')).toEqual(['me'])
    expect(excludedPeople('drinks 900 not for me', people, 'me')).toEqual(['me'])
    expect(excludedPeople('lunch 600, I didn’t pay, Dev did', people, 'me')).toEqual([])
    expect(excludedPeople('Sakshi paid, not me', people, 'me')).toEqual([])
    expect(excludedPeople('I wasn’t sure who paid, 500', people, 'me')).toEqual([])
  })
})
