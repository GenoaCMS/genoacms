import { describe, it, expect } from 'vitest'
import { bulkFailureMessage } from './bulkResult'

describe('the message of an action on several items', () => {
  it('BRW-14: the message counts what was done and names what failed', () => {
    expect(bulkFailureMessage(3, 5, 'moved', ['a.jpg', 'b/'])).toBe('3 of 5 moved. Failed: a.jpg, b/')
  })
})
