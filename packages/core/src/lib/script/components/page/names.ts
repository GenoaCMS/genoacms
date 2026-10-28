const MAX_PAGE_NAME_LENGTH = 200
const DELETE = 0x7f
const LAST_CONTROL = 0x1f

const isForbidden = (character: string): boolean => {
  const code = character.charCodeAt(0)
  return character === '/' || character === '\\' || code <= LAST_CONTROL || code === DELETE
}

/** PGE-11 */
function isPageName (name: string): boolean {
  if (name.length < 1 || name.length > MAX_PAGE_NAME_LENGTH) return false
  if (name === '.' || name === '..') return false
  return ![...name].some(isForbidden)
}

export { isPageName }
