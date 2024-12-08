export const load = ({ url }) => {
  const selectionId = url.searchParams.get('selectionId')
  return {
    selectionId
  }
}
