import selection, { type SelectionParameters } from './SelectionRune.svelte'
import { ITC } from '$lib/script/utils'

type DocumentReference = Array<string | number>
interface SelectionInitData {
  parameters: SelectionParameters,
  defaultValue: Array<DocumentReference> | undefined
}

class SelectActionRune {
  #itc: ITC
  #isActive: boolean = $state(false)
  constructor (selectionId: string | null) {
    if (!selectionId) return
    this.#isActive = true
    this.#itc = new ITC(selectionId)
    this.#init()
  }

  get isActive () {
    return this.#isActive
  }

  async #init () {
    this.#itc.send('selectionInit')
    const initData = await this.#itc.once('selectionInitData') as SelectionInitData
    selection.setParameters(initData.parameters)
    selection.load(initData.defaultValue)
  }

  async submit () {
    if (!this.#isActive) return
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
