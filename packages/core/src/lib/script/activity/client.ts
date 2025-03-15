import type { ActivityRecord } from './types'
import { PersistedState } from 'runed'

class ActivityTracker {
  #maxLength = 10
  #records = new PersistedState<Array<ActivityRecord>>('activityRecords', [])
  get records () {
    return this.#records.current
  }

  add (activity: ActivityRecord) {
    const lenght = this.#records.current.unshift(activity)
    if (lenght > this.#maxLength) this.#records.current.pop()
  }
}

const activityTracker = new ActivityTracker()

export {
  activityTracker
}
