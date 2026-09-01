import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * What an administration form does with the answer it gets back.
 *
 * **The regression this exists for:** a form that edits stored values had every field cleared by a
 * successful save, and only a reload brought them back. SvelteKit resets a form after a successful
 * action, and `HTMLFormElement.reset()` restores the *attribute* defaults — which an input bound to
 * a value in Svelte never has. Nothing in the pipeline is wrong; the fields are simply blank.
 *
 * It is asserted here rather than in a browser because the decision is a plain one: which options
 * this helper hands to `update`. A form that edits keeps its values, a form that creates does not.
 */

const toastSuccess = vi.fn()
const toastError = vi.fn()
const applyAction = vi.fn(async (_result: unknown) => undefined)

vi.mock('$app/forms', () => ({ applyAction: async (result: unknown) => await applyAction(result) }))
vi.mock('$lib/script/alert.svelte', () => ({
  toastSuccess: (message: string) => toastSuccess(message),
  toastError: (message: string) => toastError(message)
}))

const { enhanceWithToast } = await import('./formToast')

/** Runs the submit handler against one answer, and reports what it did. */
const submitted = async (
  handler: ReturnType<typeof enhanceWithToast>,
  result: { type: string, data?: { reason?: string } }
) => {
  const update = vi.fn(async () => undefined)
  const callback = await (handler as unknown as (arg: unknown) => Promise<unknown>)({})
  await (callback as (arg: unknown) => Promise<void>)({ result, update })
  return update
}

beforeEach(() => { vi.clearAllMocks() })

describe('a form that edits what is already stored', () => {
  const editing = () => enhanceWithToast('Saved', 'Could not save', undefined, { reset: false })

  it('keeps the values after a successful save', async () => {
    // The bug: without this the fields empty on save and only a reload restores them.
    const update = await submitted(editing(), { type: 'success' })

    expect(update).toHaveBeenCalledWith({ reset: false })
  })

  it('still says it saved', async () => {
    await submitted(editing(), { type: 'success' })

    expect(toastSuccess).toHaveBeenCalledWith('Saved')
  })
})

describe('a form that creates something', () => {
  const creating = () => enhanceWithToast('Created', 'Could not create')

  it('clears the fields, ready for the next one', async () => {
    // The default stays SvelteKit's: the forms that came first are creation forms, and changing it
    // under them would leave a modal holding what was just submitted.
    const update = await submitted(creating(), { type: 'success' })

    expect(update).toHaveBeenCalledWith({ reset: true })
  })
})

describe('an answer that is not a success', () => {
  const editing = () => enhanceWithToast('Saved', 'Could not save', undefined, { reset: false })

  it('keeps what was typed when the server refuses', async () => {
    // A refusal is something to correct. Clearing the form would take away the thing being fixed.
    const update = await submitted(editing(), { type: 'failure', data: { reason: 'policy.maxDepth is not an integer' } })

    expect(update).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('maxDepth'))
  })

  it('reports an error without touching the form', async () => {
    const update = await submitted(editing(), { type: 'error' })

    expect(update).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('Could not save')
  })

  it('follows a redirect rather than updating in place', async () => {
    const update = await submitted(editing(), { type: 'redirect' })

    expect(applyAction).toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('what runs only on success', () => {
  it('calls onDone once the save went through', async () => {
    const onDone = vi.fn()

    await submitted(enhanceWithToast('Saved', 'Could not save', onDone), { type: 'success' })

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not call it on a refusal, so a modal stays open to be corrected', async () => {
    const onDone = vi.fn()

    await submitted(enhanceWithToast('Saved', 'Could not save', onDone), { type: 'failure', data: {} })

    expect(onDone).not.toHaveBeenCalled()
  })
})
