import { writable, type Readable } from 'svelte/store'
import { ITC } from '$lib/script/utils'

interface SelectionStoreOptions {
  maxItems: number
}
interface SelectionOperations {
  values: Array<string>
  select: (reference: string) => void,
  isSelected: (reference: string) => boolean,
  canBeSelected: () => boolean
}

type SelectionStoreT = Readable<SelectionOperations>

function SelectionStore (selectionId: string): SelectionStoreT {
  const itc = new ITC(selectionId)
  
  let maxItems = 0;
  const selectionSet: Set<string> = new Set()
  const selectionOperations: SelectionOperations = {
    values: [],
    select: (reference: string) => {
      if (selectionSet.has(reference)) {
        selectionSet.delete(reference)
        update()
        return
      }
      if (selectionSet.size >= maxItems) return
      selectionSet.add(reference)
      update()
    },
    isSelected: (reference: string) => {
      return selectionSet.has(reference)
    },
    canBeSelected: () => {
      return selectionSet.size < maxItems
    }
  }
  const { subscribe, update: storeUpdate } = writable(selectionOperations)
  const update = () => {
    storeUpdate(operations => {
      return {
        ...operations,
        values: Array.from(selectionSet.values())
      }
    })
  }
  async function init() {
    itc.send('storageReady')
    const parameters = await itc.once('parameters')
    storeUpdate(operations => {
      maxItems = parameters.maxItems // destructuring fails here, needs special syntax and semicolon
      const selection = parameters.selection
      if (selection) loadSelection(selection)
      return operations
    })
  }
  function parseSelection(selection: Array<string>) {
    return selection.map(item => JSON.parse(item))
  }
  function loadSelection(selection: Array<object>) {
    for (const item of selection) {
      selectionSet.add(JSON.stringify(item))
    }
  }
  async function submit() {
    const selectionStringArray = Array.from(selectionSet.values())
    const selection = parseSelection(selectionStringArray)
    itc.send('submit', selection)
    await itc.once('done')
    window.close()
  }
  init()
  return {
    subscribe,
    submit,
    isSelecting: !!selectionId
  }
}

export type {
  SelectionStoreT
}
export default SelectionStore
