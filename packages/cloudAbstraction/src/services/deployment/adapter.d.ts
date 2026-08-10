type svelteKitAdapter = string
type deployProcedure = () => Promise<void>

interface Adapter {
  svelteKitAdapter
  deployProcedure
}

export default Adapter
