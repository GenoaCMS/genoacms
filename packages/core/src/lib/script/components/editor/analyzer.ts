import type { ComponentEntry, ComponentEntryAttributes } from '../componentEntry/component/types'
import type { AnalysisResult } from '@genoacms/internal/languageAdapter'
import { getLanguageAdapter } from '$lib/script/components/language.server'
import { ComponentCodeError } from './errors'

/**
 * Turning a component's source into the entry the CMS stores.
 *
 * **Reading the source is not done here.** That is language-specific work and lives in a language
 * adapter, which reports the attributes it derived and any diagnostics. What stays here is the part
 * that belongs to the CMS and that no adapter should be able to reach: merging those attributes into
 * the entry already stored, and preserving each attribute's identity while doing so.
 *
 * The adapter is chosen by the language the component records, so one instance can hold components
 * written in more than one language.
 */

/** The first thing that makes the result unusable, if anything does. */
const fatalOf = (result: AnalysisResult) =>
  result.diagnostics.find(diagnostic => diagnostic.severity === 'fatal')

/**
 * Raises a fatal diagnostic as the error the CMS already handles.
 *
 * The adapter reports rather than throws, because reporting lets it describe several problems at
 * once. The CMS commits or does not, so at this boundary the first fatal is what matters, and its
 * rule becomes the error code so a caller can still tell the cases apart.
 */
async function analyzeSource (
  language: string,
  functionName: string,
  code: string
): Promise<ComponentEntryAttributes> {
  const adapter = await getLanguageAdapter(language)
  const result = await adapter.analyze({ source: code, entryFunction: functionName }) as AnalysisResult
  const fatal = fatalOf(result)
  if (fatal) throw new ComponentCodeError(fatal.rule, fatal.message)
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
 * how the component was authored, in a record whose type says uid. Anything reading an entry without
 * knowing which path produced it was already wrong; it merely had no way to notice.
 *
 * Attributes whose parameter was removed are dropped, which is what makes deleting a parameter take
 * effect.
 */
function mergeAttributes (
  originalAttributes: ComponentEntryAttributes,
  derivedAttributes: ComponentEntryAttributes
): ComponentEntryAttributes {
  const storedByName = new Map(
    Object.values(originalAttributes).map(attribute => [attribute.name, attribute])
  )
  const mergedAttributes: ComponentEntryAttributes = {}
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
async function componentCodeToEntry (
  language: string,
  functionName: string,
  code: string,
  componentEntry: ComponentEntry
): Promise<ComponentEntry> {
  const attributes = await analyzeSource(language, functionName, code)
  componentEntry.attributes = mergeAttributes(componentEntry.attributes, attributes)
  componentEntry.attributeOrder = Object.keys(componentEntry.attributes)
  return componentEntry
}

export {
  componentCodeToEntry
}
