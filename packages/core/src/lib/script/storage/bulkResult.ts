type BulkVerb = 'uploaded' | 'moved' | 'deleted'

interface BulkResult {
  done: number
  failed: string[]
}

// BRW-14
const bulkFailureMessage = (done: number, total: number, verb: BulkVerb, failed: string[]): string =>
  `${done} of ${total} ${verb}. Failed: ${failed.join(', ')}`

const isBulkResult = (data: unknown): data is BulkResult =>
  typeof data === 'object' && data !== null &&
  typeof (data as BulkResult).done === 'number' && Array.isArray((data as BulkResult).failed)

// BRW-14
async function actInTurn<T> (items: T[], nameOf: (item: T) => string, act: (item: T) => Promise<unknown>): Promise<BulkResult> {
  const result: BulkResult = { done: 0, failed: [] }
  for (const item of items) {
    try {
      await act(item)
      result.done++
    } catch (error) {
      console.error(`storage/item-failed: ${nameOf(item)}`, error)
      result.failed.push(nameOf(item))
    }
  }
  return result
}

export type { BulkVerb, BulkResult }
export { bulkFailureMessage, isBulkResult, actInTurn }
