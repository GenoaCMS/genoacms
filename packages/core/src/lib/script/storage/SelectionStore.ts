import { writable, type Readable } from 'svelte/store'
import { ITC } from '$lib/script/utils'
import Selection, { type SelectionParameters } from './Selection'
import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

interface SelectionInitData {
  parameters: SelectionParameters,
  defaultValue: Array<ObjectReference> | undefined
}

type SelectionStoreT = Readable<Selection<ObjectReference>> & {
  submit: () => Promise<void>,
  select: (reference: ObjectReference) => void,
  isSelecting: boolean
}

function SelectionStore (selectionId: string): SelectionStoreT {
  const itc = new ITC(selectionId)
  const selection = new Selection()
  const { subscribe, set } = writable(selection)

  function select (reference: ObjectReference) {
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
