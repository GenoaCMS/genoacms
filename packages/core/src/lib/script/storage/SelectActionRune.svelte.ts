import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
import selection, { type SelectionParameters } from './SelectionRune.svelte'
import { ITC } from '$lib/script/utils'

type DocumentReference = Array<string | number | object>
interface SelectionInitData {
  parameters: SelectionParameters,
  defaultValue: Array<ObjectReference | DocumentReference> | undefined
}

class SelectActionRune {
  #itc: typeof this.isActive extends true ? ITC : undefined
  isActive: boolean = $state(false)
  constructor (selectionId: string | null) {
    if (!selectionId) return
    this.isActive = true
    this.#itc = new ITC(selectionId)
    this.#init()
  }

  async #init () {
    this.#itc.send('selectionInit')
    const initData = await this.#itc.once('selectionInitData') as SelectionInitData
    selection.setParameters(initData.parameters)
    selection.load(initData.defaultValue)
  }

  async submit () {
    if (!this.isActive) return
    this.#itc.send('selectionDone', selection.value)
    await this.#itc.once('selectionKill')
    window.close()
  }
}

export type {
  SelectionInitData,
  SelectActionRune
}
export default SelectActionRune
