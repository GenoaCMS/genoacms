import { getSecret, setSecret } from '#lib/script/secrets/providers.server.js'

/**
 * A high-water mark for a root-signed document's sequence, held in the secrets service so that it
 * cannot be rolled back with the document it dates (REG-4, POL-2).
 */

const MARK_FORMAT = /^(0|[1-9][0-9]*)$/

type MarkVerdict =
  | { ok: true, advanced: boolean }
  | { ok: false, seen: number, mark: number }

/** A mark that does not match REG-4's format; a failure to reach the secrets service is not one. */
class MarkFormatError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'MarkFormatError'
  }
}

/** Builds the error message for a mark that does not match REG-4's format. */
type UnreadableMessage = (value: string) => string

/** REG-4: the mark, 0 when absent; throws `unreadable(value)` for any other form. */
async function readMark (secret: string, unreadable: UnreadableMessage): Promise<number> {
  const stored = await getSecret(secret)
  if (stored === undefined) return 0
  if (!MARK_FORMAT.test(stored)) throw new MarkFormatError(unreadable(stored))
  return Number(stored)
}

/** REG-4, POL-2: refuses a sequence below the mark, and raises the mark to a higher one. */
async function checkAndAdvanceMark (secret: string, sequence: number, unreadable: UnreadableMessage): Promise<MarkVerdict> {
  const mark = await readMark(secret, unreadable)
  if (sequence < mark) return { ok: false, seen: sequence, mark }
  if (sequence === mark) return { ok: true, advanced: false }
  await setSecret(secret, String(sequence))
  return { ok: true, advanced: true }
}

/** REG-4, POL-2: raises the mark to a sequence just written; called after the document. */
async function recordMark (secret: string, sequence: number, unreadable: UnreadableMessage): Promise<void> {
  const mark = await readMark(secret, unreadable)
  if (sequence <= mark) return
  await setSecret(secret, String(sequence))
}

export {
  MarkFormatError,
  MARK_FORMAT,
  readMark,
  checkAndAdvanceMark,
  recordMark
}

export type {
  MarkVerdict,
  UnreadableMessage
}
