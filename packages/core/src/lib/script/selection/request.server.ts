import { matchesConfirmation } from './NamedSelection.svelte'
import { isString } from '$lib/script/utils'

/**
 * Reading a bulk-deletion request.
 *
 * The confirmation is re-checked here, not trusted from the form. The control that collects it is a
 * convenience for the person; a request arriving without a matching phrase must delete nothing,
 * whatever produced it.
 *
 * Shared by the component and page lists so the rule is stated once — two copies would eventually
 * disagree about what counts as confirmed, and the weaker one would be the one that mattered.
 */

type BulkDeletion =
  | { ok: true, ids: string[] }
  | { ok: false, reason: string }

const parseNameList = (raw: FormDataEntryValue | null): string[] | undefined => {
  if (!isString(raw)) return undefined
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every(isString) ? parsed : undefined
  } catch {
    return undefined
  }
}

function parseBulkDeletion (data: FormData): BulkDeletion {
  const ids = parseNameList(data.get('ids'))
  const names = parseNameList(data.get('names'))
  const confirmation = data.get('confirmation')

  if (ids === undefined || names === undefined) return { ok: false, reason: 'selection/malformed' }
  if (ids.length === 0) return { ok: false, reason: 'selection/empty' }
  // Ids are what gets deleted and names are what was confirmed, so a mismatched pair means the two
  // describe different things and neither can be trusted.
  if (ids.length !== names.length) return { ok: false, reason: 'selection/mismatched' }
  if (!isString(confirmation) || !matchesConfirmation(confirmation, names)) {
    return { ok: false, reason: 'selection/not-confirmed' }
  }

  return { ok: true, ids }
}

export { parseBulkDeletion }

export type { BulkDeletion }
