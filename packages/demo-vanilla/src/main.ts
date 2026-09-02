import { settings } from '@genoacms/demo-support/instance'
import { loadPage } from '@genoacms/demo-support/page'
import { renderResolved } from '@genoacms/sdk'
import { components } from './components/index'

/**
 * A consumer with no framework at all.
 *
 * ## The shortest of the four, and the one that needs no wrapper
 *
 * The SDK's own renderer already walks a resolved tree and produces a DOM node, so a consumer whose
 * components are plain functions returning nodes has nothing to write: `renderResolved` *is* the
 * wrapper. The other three demos exist because a React or Vue consumer wants its own components
 * rather than these, and that is what a wrapper buys.
 *
 * ## What a component is here
 *
 * A function taking its attribute values **positionally** and returning a node. See `src/components/`,
 * which is the whole of what a consumer writes here — there is no `src/genoa/`, because there is no
 * wrapper to write.
 */

const mount = document.querySelector('#app') as HTMLElement

const report = (reason: string, detail?: string): void => {
  const box = document.createElement('div')
  box.className = 'refusal'
  const heading = document.createElement('h2')
  heading.textContent = reason
  box.append(heading)
  if (detail !== undefined) {
    const pre = document.createElement('pre')
    pre.textContent = detail
    box.append(pre)
  }
  mount.replaceChildren(box)
}

const main = async (): Promise<void> => {
  const outcome = await loadPage(settings(import.meta.env as Record<string, string | undefined>))
  if (!outcome.ok) return report(outcome.reason, outcome.detail)

  const rendered = await renderResolved(outcome.tree, { components })
  if (!rendered.ok) return report('The page could not be rendered.', rendered.reason)

  mount.replaceChildren(rendered.value)

  // A component that verified and would not run fails only its own node; the rest of the page is
  // real. Reported rather than hidden, because being able to see that distinction is the point.
  if (rendered.failures.length > 0) {
    const aside = document.createElement('aside')
    aside.className = 'failures'
    aside.textContent = `${rendered.failures.length} component(s) did not run: ` +
      rendered.failures.map(failure => `${failure.component} (${failure.reason})`).join('; ')
    mount.append(aside)
  }
}

void main()
