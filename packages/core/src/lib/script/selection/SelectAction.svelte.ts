import { ITC } from '$lib/script/utils'

/**
 * Driving a selection window opened by another page.
 *
 * A storage resource or document field opens the browser in a second window with a `selectionId`.
 * That window announces itself, receives the parameters and any current value, and sends the chosen
 * items back when the user confirms — then closes itself.
 *
 * **One implementation, not one per domain.** The storage and collection copies of this were
 * identical apart from the reference type and a single line forcing `allowDirectories` off, which is
 * now a constructor argument. The protocol is the same either way: it is about windows talking to
 * each other, and knows nothing about what is being picked.
 */

/** What this needs of a selection. Both the storage and document selections satisfy it. */
interface PickerSelection<Item, Parameters> {
  setParameters: (parameters: Partial<Parameters>) => void
  load: (items: Item[] | undefined) => void
  readonly value: Item[]
}

interface SelectionInitData<Item, Parameters> {
  parameters: Parameters
  defaultValue: Item[] | undefined
}

class SelectAction<Item, Parameters> {
  #itc: ITC | undefined
  #isActive: boolean = $state(false)
  #selection: PickerSelection<Item, Parameters>
  #forced: Partial<Parameters>

  /**
   * `selectionId` is absent on an ordinary visit, which is what makes the picker controls invisible
   * there — the browser is the same screen whether or not something is picking from it.
   *
   * `forced` overrides what the opener asked for, for a rule the opener is not entitled to relax:
   * a storage field takes files, so directories are not selectable however the request was framed.
   */
  constructor (
    selectionId: string | null,
    selection: PickerSelection<Item, Parameters>,
    forced: Partial<Parameters> = {}
  ) {
    this.#selection = selection
    this.#forced = forced
    if (!selectionId) return

    this.#isActive = true
    this.#itc = new ITC(selectionId)
    // Deliberately not awaited: a constructor cannot be async, and the window is usable while the
    // handshake completes — the controls it gates are hidden until `isActive` says otherwise.
    this.#init().catch((error: unknown) => {
      console.warn('[genoacms:selection] the selection window could not be initialised', error)
    })
  }

  get isActive (): boolean {
    return this.#isActive
  }

  async #init (): Promise<void> {
    this.#itc?.send('selectionInit')
    const initData = await this.#itc?.once('selectionInitData') as SelectionInitData<Item, Parameters>

    this.#selection.setParameters({ ...initData.parameters, ...this.#forced })
    this.#selection.load(initData.defaultValue)
  }

  async submit (): Promise<void> {
    if (!this.#isActive) return

    this.#itc?.send('selectionDone', this.#selection.value)
    // The opener acknowledges before this window goes, so the value is never lost to a close that
    // outran it.
    await this.#itc?.once('selectionKill')
    window.close()
  }
}

export { SelectAction }

export type { PickerSelection, SelectionInitData }
