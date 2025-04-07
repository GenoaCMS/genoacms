import type { ActivityRecord } from './types'
import { PersistedState } from 'runed'

function areActivitiesSame (a: ActivityRecord, b: ActivityRecord): boolean {
  if (a.type !== b.type) return false
  if (
    a.type === 'collections' && b.type === 'collections'
  ) return a.collection === b.collection && a.document === b.document
  if (
    a.type === 'storage' && b.type === 'storage'
  ) return a.bucket === b.bucket && a.path === b.path
  if (
    (a.type === 'componentEntry' && b.type === 'componentEntry') ||
    (a.type === 'componentCode' && b.type === 'componentCode')
  ) return a.componentId === b.componentId
  if (
    a.type === 'page' && b.type === 'page'
  ) return a.pageId === b.pageId
  return false
}

class ActivityTracker {
  #maxLength = 10
  #records = new PersistedState<Array<ActivityRecord>>('activityRecords', [])
  get records () {
    return this.#records.current
  }

  add (activity: ActivityRecord) {
    const activityIndex = this.#records.current.findIndex(a => areActivitiesSame(a, activity))
    if (activityIndex !== -1) this.#records.current.splice(activityIndex, 1)
    const lenght = this.#records.current.unshift(activity)
    if (lenght > this.#maxLength) this.#records.current.pop()
  }
}

const activityTracker = new ActivityTracker()

export {
  activityTracker
}
