import {
  listOrCreateComponentEntryList
} from '$lib/script/components/componentEntry/io.server'

export const load = async () => {
  const componentEntries = await listOrCreateComponentEntryList()
  return {
    componentEntries
  }
}
