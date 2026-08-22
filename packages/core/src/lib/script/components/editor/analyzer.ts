import type { ComponentEntry, ComponentEntryAttributes } from '../componentEntry/component/types'
import type { AnalysisResult } from '@genoacms/internal/languageAdapter'
import adapter from '@genoacms/language-adapter-ts'
import { ComponentCodeError } from './errors'

/**
 * Turning a component's source into the entry the CMS stores.
 *
 * **Reading the source is not done here.** That is language-specific work and lives in a language
 * adapter, which reports the attributes it derived and any diagnostics. What stays here is the part
 * that belongs to the CMS and that no adapter should be able to reach: merging those attributes into
 * the entry already stored, and preserving each attribute's identity while doing so.
 *
 * The adapter is currently resolved statically. Selecting it from the component's declared language,
 * through configuration, is the next step; nothing about this file changes when it arrives.
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
function analyseSource (functionName: string, code: string): ComponentEntryAttributes {
  const result = adapter.analyse({ source: code, entryFunction: functionName }) as AnalysisResult
  const fatal = fatalOf(result)
  if (fatal) throw new ComponentCodeError(fatal.rule, fatal.message)
  return result.attributes
}

/**
 * Merges freshly derived attributes into the stored ones.
 *
 * **Uids are preserved for every attribute that survived**, because a page node refers to an
 * attribute by uid: issuing a new one would silently detach every page using it. Attributes whose
 * parameter was removed are dropped, which is what makes a deleted parameter take effect.
 */
function mergeAttributes (
  originalAttributes: ComponentEntryAttributes,
  newAttributes: ComponentEntryAttributes
): ComponentEntryAttributes {
  const mergedAttributes: ComponentEntryAttributes = {}
  for (const attribute of Object.values(newAttributes)) {
    const originalAttribute = originalAttributes[attribute.name]
    if (!originalAttribute) {
      mergedAttributes[attribute.name] = attribute
      continue
    }
    mergedAttributes[attribute.name] = {
      ...attribute,
      uid: originalAttribute.uid
    }
  }
  return mergedAttributes
}

function componentCodeToEntry (functionName: string, code: string, componentEntry: ComponentEntry): ComponentEntry {
  const attributes = analyseSource(functionName, code)
  componentEntry.attributes = mergeAttributes(componentEntry.attributes, attributes)
  return componentEntry
}

export {
  componentCodeToEntry
}
