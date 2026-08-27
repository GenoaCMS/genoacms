import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { settings } from '@genoacms/demo-support/instance'
import { loadPage, type Outcome } from '@genoacms/demo-support/page'
import { GenoaComponent } from './genoa/GenoaComponent'
import { bindings } from './components/index'

/**
 * A React consumer.
 *
 * Fetching and verifying is `loadPage`, shared with the other three demos and identical in all of
 * them. Everything React-shaped is `src/genoa/` — the wrapper, which is boilerplate — and `src/components/`,
 * which is this application's own.
 *
 * **In an effect, not at build time.** The whole claim is that a consumer verifies for itself; a page
 * that arrived already rendered would have had that done on its behalf by something it cannot check.
 */

const Refusal = ({ reason, detail }: { reason: string, detail?: string }): ReactNode =>
  <div className="refusal">
    <h2>{reason}</h2>
    {detail !== undefined && <pre>{detail}</pre>}
  </div>

const App = (): ReactNode => {
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void loadPage(settings(import.meta.env as Record<string, string | undefined>))
      .then(result => { if (!cancelled) setOutcome(result) })
    return () => { cancelled = true }
  }, [])

  if (outcome === undefined) return <p className="waiting">Fetching and verifying…</p>
  if (!outcome.ok) return <Refusal reason={outcome.reason} detail={outcome.detail} />
  return <GenoaComponent node={outcome.tree} bindings={bindings} />
}

createRoot(document.querySelector('#app') as HTMLElement).render(
  <StrictMode><App /></StrictMode>
)
