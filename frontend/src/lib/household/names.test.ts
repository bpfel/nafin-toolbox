import { describe, test, expect } from 'vitest'
import { memberName } from './names'

describe('memberName', () => {
  test('the name the household gave, else the address', () => {
    const people = { '7': { name: 'Anna' } }
    expect(memberName(people, { user_id: 7, email: 'anna@nafin.test' })).toBe('Anna')
    expect(memberName(people, { user_id: 8, email: 'ben@nafin.test' })).toBe('ben@nafin.test')
  })
})
