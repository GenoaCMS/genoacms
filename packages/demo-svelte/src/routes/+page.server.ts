import { error } from '@sveltejs/kit'
import { GENOACMS_CREDENTIALS, GENOACMS_REGISTRY_SEQUENCE_SECRET } from '$app/env/private'
import type { LoadOptions } from '@genoacms/demo-support/page'
import { readRegistryMark } from '../registryMark.server'
import type { PageServerLoad } from './$types'

/** VFY-2: the mark is read on the server; the page is still fetched and verified in the browser. */
export const load: PageServerLoad = async (): Promise<LoadOptions> => {
  const secret = GENOACMS_REGISTRY_SEQUENCE_SECRET ?? ''
  if (secret === '') return {}
  try {
    return { minimumRegistrySequence: await readRegistryMark(secret, GENOACMS_CREDENTIALS ?? '') }
  } catch {
    error(503, 'The key registry mark could not be read.')
  }
}
