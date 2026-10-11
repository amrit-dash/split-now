import { describe, expect, it } from 'vitest'
import { insertMention, mentionCandidates, mentionParts, mentionQuery, mentionsIn } from './mentions'

const labels = { a: 'Asha', r: 'Rahul', rs: 'Rahul S.', p: 'Priya' }

describe('typing a mention', () => {
  it('finds the "@query" before the caret', () => {
    expect(mentionQuery('hi @ra', 6)).toEqual({ start: 3, query: 'ra' })
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionQuery('@rahul s', 8)).toEqual({ start: 0, query: 'rahul s' })
  })
  it('not inside an email, across lines, or after a long phrase', () => {
    expect(mentionQuery('mail me@x.com', 13)).toBeNull()
    expect(mentionQuery('@ra\nhi', 6)).toBeNull()
    expect(mentionQuery('@who paid for the cab', 21)).toBeNull()
    expect(mentionQuery('no at sign', 5)).toBeNull()
  })
  it('offers names that start with it first, then ones that contain it, not yourself', () => {
    expect(mentionCandidates(labels, 'ra').map((c) => c.id)).toEqual(['r', 'rs'])
    expect(mentionCandidates(labels, 'iy').map((c) => c.id)).toEqual(['p'])
    expect(mentionCandidates(labels, '', 'a').map((c) => c.id)).toEqual(['p', 'r', 'rs'])
  })
  it('writes "@Label " in place of the query', () => {
    expect(insertMention('hi @ra how', 3, 6, 'Rahul S.')).toEqual({ text: 'hi @Rahul S. how', caret: 13 })
    expect(insertMention('@', 0, 1, 'Asha')).toEqual({ text: '@Asha ', caret: 6 })
  })
})

describe('reading mentions from a message', () => {
  it('the longest label wins, once each', () => {
    expect(mentionsIn('@Rahul S. and @Rahul, @rahul s. again', labels)).toEqual(['rs', 'r'])
    expect(mentionsIn('thanks @Priya!', labels)).toEqual(['p'])
  })
  it('a name inside a word or an email is not a mention; the author is left out', () => {
    expect(mentionsIn('@Ashamed of me@Asha', labels)).toEqual([])
    expect(mentionsIn('@Asha and @Priya', labels, 'a')).toEqual(['p'])
  })
  it('splits the words for highlighting, only the people given', () => {
    expect(mentionParts('hey @Priya, @Asha', labels, ['p'])).toEqual([{ text: 'hey ' }, { text: '@Priya', mention: 'p' }, { text: ', @Asha' }])
    expect(mentionParts('plain', labels)).toEqual([{ text: 'plain' }])
  })
})
