import { getSecret, setSecret } from '$lib/script/secrets/providers.server'
import { REGISTRY_SEQUENCE_SECRET } from './secretNames'

/**
 * The high-water mark for the key registry's sequence.
 *
 * A signature establishes that a document came from this instance; it says nothing about *when*.
 * So an adversary who can write the bucket and kept an older registry can restore it, replaying a
 * valid root signature and undoing whatever the newer one recorded — a revocation, above all.
 *
 * The mark is kept in the **secrets service**, and that placement is the entire mechanism. Held
 * beside the registry it could be rolled back along with it, attesting to nothing.
 */

type SequenceVerdict =
  | { ok: true, advanced: boolean }
  | { ok: false, seen: number, mark: number }

async function readHighWaterMark (): Promise<number> {
  const stored = await getSecret(REGISTRY_SEQUENCE_SECRET)
  if (stored === undefined) return 0

  const parsed = Number(stored)
  if (!Number.isInteger(parsed) || parsed < 0) {
    // Refusing beats guessing: reading a corrupt mark as 0 would silently disable rollback
    // detection, which is exactly what an adversary who could corrupt it would want.
    throw new Error(`registry-sequence/unreadable: ${REGISTRY_SEQUENCE_SECRET} is '${stored}'`)
  }
  return parsed
}

/**
 * Checks a registry's sequence against the mark, advancing it when the registry is newer.
 *
 * Advancing on read is also the repair path: publication writes the registry first and the mark
 * second, so a crash between them leaves the mark behind, and the next load catches it up.
 */
async function checkAndAdvance (sequence: number): Promise<SequenceVerdict> {
  const mark = await readHighWaterMark()
  if (sequence < mark) return { ok: false, seen: sequence, mark }
  if (sequence === mark) return { ok: true, advanced: false }

  await setSecret(REGISTRY_SEQUENCE_SECRET, String(sequence))
  return { ok: true, advanced: true }
}

/**
 * Records a newly published sequence.
 *
 * Called **after** the registry is written. The ordering is chosen for its failure mode: a crash
 * here leaves the mark behind the registry, weakening rollback detection until the next load
 * repairs it. The reverse order would leave the mark ahead, and the instance would reject its own
 * current registry and be unable to verify anything at all.
 */
async function recordPublished (sequence: number): Promise<void> {
  const mark = await readHighWaterMark()
  if (sequence <= mark) return
  await setSecret(REGISTRY_SEQUENCE_SECRET, String(sequence))
}

export {
  readHighWaterMark,
  checkAndAdvance,
  recordPublished
}

export type {
  SequenceVerdict
}
