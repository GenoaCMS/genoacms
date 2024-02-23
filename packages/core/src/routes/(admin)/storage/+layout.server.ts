export const load = ({ url }) => {
  const maxSelectionItems = parseInt(url.searchParams.get('maxSelectionItems') || '0')
  return {
    maxSelectionItems
  }
}
