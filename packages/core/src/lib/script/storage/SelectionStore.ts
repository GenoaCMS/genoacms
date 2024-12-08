import { writable, type Readable } from 'svelte/store'
import { ITC } from '$lib/script/utils'
import Selection, { type SelectionParameters } from '$lib/script/storage/Selection'

type DocumentReference = Array<string | number | object>
interface SelectionInitData {
  parameters: SelectionParameters,
  defaultValue: Array<ObjectReference> | DocumentReference | undefined
}

type SelectionStoreT<T> = Readable<Selection<T>> & {
  submit: () => Promise<void>,
  select: (reference: T) => void,
  isSelecting: boolean
}

function SelectionStore <T> (selectionId: string): SelectionStoreT<T> {
  const itc = new ITC(selectionId)
  const selection = new Selection()
  const { subscribe, set } = writable(selection)

  function select (reference: T) {
    selection.select(reference)
    set(selection)
  }
  async function init () {
    itc.send('selectionInit')
    const initData = await itc.once('selectionInitData') as SelectionInitData
    selection.setParameters(initData.parameters)
    selection.load(initData.defaultValue)
    set(selection)
  }
  async function submit () {
    itc.send('selectionDone', selection.value)
    await itc.once('selectionKill')
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
  SelectionStoreT,
  SelectionInitData
}
export default SelectionStore
