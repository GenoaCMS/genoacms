import type { ComponentHeader, ComponentHeaderAttributes } from '../componentHeader/component/types'
import type { AnalysisResult } from '@genoacms/internal/languageAdapter'
import { getLanguageAdapter } from '$lib/script/components/language.server'
import { raiseFatal } from './diagnostics'

/**
 * Turning a component's source into the header the CMS stores.
 *
 * **Reading the source is not done here.** That is language-specific work and lives in a language
 * adapter, which reports the attributes it derived and any diagnostics. What stays here is the part
 * that belongs to the CMS and that no adapter should be able to reach: merging those attributes into
 * the header already stored, and preserving each attribute's identity while doing so.
 *
 * The adapter is chosen by the language the component records, so one instance can hold components
 * written in more than one language.
 */

/** Reads the source through the adapter, raising the first fatal diagnostic as a refusal. */
async function analyzeSource (
  language: string,
  functionName: string,
  code: string
): Promise<ComponentHeaderAttributes> {
  const adapter = await getLanguageAdapter(language)
  const result = await adapter.analyze({ source: code, entryFunction: functionName }) as AnalysisResult
  raiseFatal(result.diagnostics)
  return result.attributes
}

/**
 * Merges freshly derived attributes into the stored ones.
 *
 * **Matched by name, stored by uid** — the two are different jobs and were previously conflated.
 *
 * The *name* is what an author controls: it is the parameter they wrote, and it is the only thing
 * that says "this is still the same attribute" across a re-analysis. The *uid* is identity the CMS
 * assigns, and it is what a page node holds, so an attribute that survives must keep it or every
 * page using it detaches silently.
 *
 * Keying the result by name is what this used to do, which left dynamic components keyed by name
 * while components built in the editor were keyed by uid — one field with two meanings depending on
 * how the component was authored, in a record whose type says uid. Anything reading a header without
 * knowing which path produced it was already wrong; it merely had no way to notice.
 *
 * Attributes whose parameter was removed are dropped, which is what makes deleting a parameter take
 * effect.
 */
function mergeAttributes (
  originalAttributes: ComponentHeaderAttributes,
  derivedAttributes: ComponentHeaderAttributes
): ComponentHeaderAttributes {
  const storedByName = new Map(
    Object.values(originalAttributes).map(attribute => [attribute.name, attribute])
  )
  const mergedAttributes: ComponentHeaderAttributes = {}
  for (const attribute of Object.values(derivedAttributes)) {
    const uid = storedByName.get(attribute.name)?.uid ?? attribute.uid
    mergedAttributes[uid] = { ...attribute, uid }
  }
  return mergedAttributes
}

/**
 * Re-derives a component's attributes from its source.
 *
 * The order comes from the source: parameters are declared in an order, and that is the order an
 * author expects to edit them in. For a component authored in the editor the order is dragged by
 * hand and stored, but here the code is the record — so re-analyzing restates it rather than
 * preserving a previous arrangement that the source may have just changed.
 */
async function componentCodeToHeader (
  language: string,
  functionName: string,
  code: string,
  componentHeader: ComponentHeader
): Promise<ComponentHeader> {
  const attributes = await analyzeSource(language, functionName, code)
  componentHeader.attributes = mergeAttributes(componentHeader.attributes, attributes)
  componentHeader.attributeOrder = Object.keys(componentHeader.attributes)
  return componentHeader
}

export {
  componentCodeToHeader
}
