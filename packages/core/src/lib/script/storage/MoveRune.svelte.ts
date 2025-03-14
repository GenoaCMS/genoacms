import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

class Move {
  isActive = $state(false)
  contents: Array<ObjectReference> = $state([])
  start (object: ObjectReference) {
    this.isActive = true
    this.contents = [object]
  }

  clear () {
    this.isActive = false
    this.contents = []
  }
}

const move = new Move()
export default move
