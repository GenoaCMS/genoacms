import { writable, type Readable } from 'svelte/store'
import { ITC } from '$lib/script/utils'
import Selection from './Selection'

interface SelectionStoreOptions {
  maxItems: number
}

type SelectionStoreT = Readable<Selection>

function SelectionStore (selectionId: string): SelectionStoreT {
  const itc = new ITC(selectionId)
  const selection = new Selection()
  const { subscribe, set } = writable(selection)

  function select (reference: string) {
    selection.select(reference)
    set(selection)
  }
  async function init () {
    itc.send('storageReady')
    const parameters = await itc.once('parameters')
    selection.setParameters(parameters)
    if (parameters.selection) selection.load(parameters.selection)
    set(selection)
  }
  async function submit () {
    itc.send('submit', selection.value)
    await itc.once('done')
    window.close()
  }
  init()
  return {
    subscribe,
    submit,
    select,
    isSelecting: !!selectionId
  }
}

export type {
  SelectionStoreT
}
export default SelectionStore
