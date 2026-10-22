import { describe, expect, it } from 'vitest'
import { offTopicLine, QUICK_ANSWER, quickAnswerFor } from './quick-answer'

describe('offTopicLine', () => {
  it('requests and questions with nothing about money', () => {
    expect(offTopicLine('Make me a sandwich')).toBe(true)
    expect(offTopicLine("what's the weather like")).toBe(true)
    expect(offTopicLine('hey play some music')).toBe(true)
    expect(offTopicLine('can you book a table')).toBe(true)
  })
  it('anything that notes a cost or a group is not', () => {
    expect(offTopicLine('dinner with Rahul')).toBe(false)
    expect(offTopicLine('make a group for Goa trip')).toBe(false)
    expect(offTopicLine('what I paid for the cab')).toBe(false)
    expect(offTopicLine('show 500')).toBe(false)
    expect(offTopicLine('Rahul and Priya')).toBe(false)
    expect(offTopicLine('')).toBe(false)
  })
})

describe('quickAnswerFor', () => {
  it('a plain answer for what it can’t act on, saying what it can do', () => {
    expect(quickAnswerFor({ text: 'Make me a sandwich', amount: undefined })).toBe(QUICK_ANSWER)
    expect(QUICK_ANSWER).toMatch(/adds expenses, starts groups/)
    expect(QUICK_ANSWER).not.toMatch(/!/)
  })
  it('AI that found nothing to do is believed when there is no amount', () => {
    expect(quickAnswerFor({ text: 'the thing with the stuff', amount: undefined, aiUnknown: true })).toBe(QUICK_ANSWER)
    expect(quickAnswerFor({ text: 'the thing 300', amount: 30000, aiUnknown: true })).toBeNull()
  })
  it('otherwise the form opens as before', () => {
    expect(quickAnswerFor({ text: 'dinner with Rahul', amount: undefined })).toBeNull()
    expect(quickAnswerFor({ text: 'make me a sandwich 200', amount: 20000 })).toBeNull()
    expect(quickAnswerFor({ text: '  ', amount: undefined, aiUnknown: true })).toBeNull()
  })
})
