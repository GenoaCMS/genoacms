import type { PrebuiltComponents } from '@genoacms/sdk'

/**
 * This consumer's components, as plain functions returning DOM nodes.
 *
 * ## The contract
 *
 * A component takes its attribute values **positionally, in the order the publication signed**, and
 * returns a `Node`. A slot arrives as `readonly Node[]` — its children, already rendered.
 *
 * Nothing enforces that the parameter list here matches what the CMS published. The signed
 * `attributeOrder` decides which value reaches which parameter, so writing them in the wrong order
 * puts the right values in the wrong places with every signature still valid. On the CMS's side that
 * mistake is impossible by construction; on this side it is an ordinary bug, and the honest thing is
 * to say so rather than imply the SDK catches it.
 *
 * ## Keyed by the published name
 *
 * Not by the name in the page. A publication is immutable, so the name it was released under never
 * changes; a page carries whatever the component was called when the page was built.
 */

const element = (tag: string, className: string, ...children: Array<Node | string>): HTMLElement => {
  const node = document.createElement(tag)
  node.className = className
  node.append(...children)
  return node
}

/** The page root: a slot and nothing else. */
const demoPage = (body: readonly Node[]): Node => element('main', 'page', ...body)

/** A titled region holding other components — what makes the tree nest. */
const demoSection = (heading: string, content: readonly Node[]): Node =>
  element('section', 'section', element('h2', 'section-heading', heading), ...content)

/** Two text values, so a wrapper putting them in the wrong parameters is visible on screen. */
const demoCard = (title: string, body: string): Node =>
  element('article', 'card', element('h3', 'card-title', title), element('p', 'card-body', body))

/** Text and a number, so a renderer that stringifies everything shows itself. */
const demoNote = (text: string, order: number): Node =>
  element('aside', 'note', element('span', 'note-order', String(order)), element('p', 'note-text', text))

const components: PrebuiltComponents = {
  demoPage: demoPage as PrebuiltComponents[string],
  demoSection: demoSection as PrebuiltComponents[string],
  demoCard: demoCard as PrebuiltComponents[string],
  demoNote: demoNote as PrebuiltComponents[string]
}

export { components, demoPage, demoSection, demoCard, demoNote }
