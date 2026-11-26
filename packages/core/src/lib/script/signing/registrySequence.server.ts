import { REGISTRY_SEQUENCE_SECRET } from './secretNames'
import { MARK_FORMAT, readMark, checkAndAdvanceMark, recordMark, type MarkVerdict } from './sequenceMark.server'

/** The key manifest's mark (REG-4). */

type SequenceVerdict = MarkVerdict

const unreadable = (value: string): string => `registry-sequence/unreadable: ${REGISTRY_SEQUENCE_SECRET} is '${value}'`

async function readHighWaterMark (): Promise<number> {
  return await readMark(REGISTRY_SEQUENCE_SECRET, unreadable)
}

async function checkAndAdvance (sequence: number): Promise<SequenceVerdict> {
  return await checkAndAdvanceMark(REGISTRY_SEQUENCE_SECRET, sequence, unreadable)
}

async function recordPublished (sequence: number): Promise<void> {
  await recordMark(REGISTRY_SEQUENCE_SECRET, sequence, unreadable)
}

export {
  MARK_FORMAT,
  readHighWaterMark,
  checkAndAdvance,
  recordPublished
}

export type {
  SequenceVerdict
}
