import { describe, expect, it } from 'vitest'
import { REMIND_ALL, remindAsk, remindMatches, remindNote } from './quick-remind'

describe('remindAsk: a line asking to chase someone', () => {
  it('the people it names', () => {
    expect(remindAsk('remind Rahul')).toEqual(['rahul'])
    expect(remindAsk('Remind Rahul to pay.')).toEqual(['rahul'])
    expect(remindAsk('please remind Rahul and Priya about the Goa trip')).toEqual(['rahul', 'priya'])
    expect(remindAsk('remind Rahul S, Priya & Dev')).toEqual(['rahul s', 'priya', 'dev'])
    expect(remindAsk('can you nudge Rohan again')).toEqual(['rohan'])
    expect(remindAsk('send a reminder to Meera')).toEqual(['meera'])
    expect(remindAsk('send Meera a reminder')).toEqual(['meera'])
    expect(remindAsk('ask Kiran to pay me back')).toEqual(['kiran'])
    expect(remindAsk('remind rahul he owes me 500')).toEqual(['rahul'])
    expect(remindAsk('Rémind Ananyá')).toEqual(['ananya'])
  })
  it('everyone who owes you', () => {
    expect(remindAsk('remind everyone')).toEqual([REMIND_ALL])
    expect(remindAsk('chase everybody who owes me')).toEqual([REMIND_ALL])
  })
  it('not a reminder for someone else', () => {
    expect(remindAsk('remind me to pay rent')).toBeNull()
    expect(remindAsk('remind us about dinner')).toBeNull()
    expect(remindAsk('dinner 1200 with Rahul, remind him later')).toBeNull()
    expect(remindAsk('Rahul paid 500 for the reminder app')).toBeNull()
    expect(remindAsk('remind the guy from the cafe about the bill tomorrow morning')).toBeNull()
    expect(remindAsk('ask Kiran about dinner')).toBeNull()
  })
})

const people = [
  { key: 'u_rahul', name: 'Rahul Sharma', net: 50000 },
  { key: 'n_rahulv', name: 'Rahul Verma', net: 1200 },
  { key: 'u_priya', name: 'Priya', net: -3000 },
  { key: 'u_dev', name: 'Dev Patel', net: 800 },
]
const everyone = ['Rahul Sharma', 'Rahul Verma', 'Priya', 'Dev Patel', 'Meera']

describe('remindMatches: who on Balances', () => {
  it('everyone named who owes you; both Rahuls when only the first name is said', () => {
    expect(remindMatches(['rahul'], people, everyone)).toEqual({ keys: ['u_rahul', 'n_rahulv'], square: [], unknown: [] })
    expect(remindMatches(['rahul v'], people, everyone).keys).toEqual(['n_rahulv'])
    expect(remindMatches(['rahul sharma', 'dev'], people, everyone).keys).toEqual(['u_rahul', 'u_dev'])
  })
  it('one letter off, as speech mishears it', () => expect(remindMatches(['raul'], people, everyone).keys).toEqual(['u_rahul', 'n_rahulv']))
  it('square with you, or in none of your groups', () => {
    expect(remindMatches(['priya', 'meera', 'kabir'], people, everyone)).toEqual({ keys: [], square: ['priya', 'meera'], unknown: ['kabir'] })
  })
  it('everyone: all who owe you', () => expect(remindMatches([REMIND_ALL], people, everyone).keys).toEqual(['u_rahul', 'n_rahulv', 'u_dev']))
})

describe('remindNote', () => {
  it('says who was left out and why', () => {
    expect(remindNote({ keys: [], square: ['priya'], unknown: [] })).toEqual(['Priya doesn’t owe you anything right now.'])
    expect(remindNote({ keys: [], square: ['priya', 'meera'], unknown: ['kabir'] })).toEqual([
      'Priya and Meera don’t owe you anything right now.',
      'No one called Kabir is in your groups.',
    ])
    expect(remindNote({ keys: ['x'], square: [], unknown: [] })).toEqual([])
  })
})
