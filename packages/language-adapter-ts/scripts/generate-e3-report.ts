import { SAST_RULES } from '@genoacms/internal/sast'
import type { SastRuleId } from '@genoacms/internal/sast'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import adapter from '../src/index.js'
import { corpus } from '../evidence/corpus.js'
import { report } from '../evidence/coverage.js'
import type { Outcome } from '../evidence/coverage.js'

/**
 * Emits the E3 coverage table as Markdown.
 *
 * It prints what `corpus.test.ts` asserts, from the same corpus and the same arithmetic, so the two
 * cannot disagree. Printing it verifies nothing on its own — the table is evidence only while that
 * suite passes, which is the footing the permission matrix stands on too.
 */

const shape: ComponentShape = {
  attributes: {
    a: { uid: 'a', name: 'count', type: 'number', schema: { title: 'count' } } as never,
    b: { uid: 'b', name: 'heading', type: 'string', schema: { title: 'heading' } } as never
  },
  attributeOrder: ['a', 'b']
}

const outcomes: Outcome[] = await Promise.all(corpus.map(async entry => {
  const result = await adapter.analyze({
    body: entry.body, shape, fetchOrigins: ['https://api.example.com']
  })
  return {
    entry,
    rules: [...new Set(
      result.diagnostics
        .filter(one => one.type === 'security-rule')
        .map(one => (one as { rule: SastRuleId }).rule)
    )]
  }
}))

const measured = report(outcomes)
const percent = (part: number, whole: number): string =>
  whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`

const lines: string[] = [
  '# E3 — SAST rule coverage against the bypass corpus',
  '',
  measured.extensionOnly
    ? '> **Extension-only.** No externally sourced entry exists yet, so this figure is measured ' +
      'against patterns authored alongside the rules. It is secondary evidence until the external ' +
      'baseline is added: a coverage number over a corpus its author invented is the circularity ' +
      'this measurement exists to avoid.'
    : '> Coverage is reported per origin below. The externally sourced half is the primary evidence.',
  '',
  `**${measured.rejected} of ${measured.expected} rejected** ` +
  `(${percent(measured.rejected, measured.expected)}).`,
  '',
  '## Per rule',
  '',
  '| Rule | Name | Entries | Rejected |',
  '| :--- | :--- | ---: | ---: |',
  ...measured.byRule.map(one =>
    `| \`${one.rule}\` | ${SAST_RULES[one.rule]?.name ?? ''} | ${one.expected} | ` +
    `${one.rejected} (${percent(one.rejected, one.expected)}) |`),
  '',
  '## Per origin',
  '',
  '| Origin | Entries | Rejected |',
  '| :--- | ---: | ---: |',
  ...measured.byOrigin.map(one =>
    `| ${one.origin} | ${one.expected} | ${one.rejected} (${percent(one.rejected, one.expected)}) |`),
  '',
  '## What the ruleset does not reject',
  '',
  'Reported rather than omitted. These are the empirical content of the statement that completeness',
  'is not claimed.',
  ''
]

for (const group of measured.escapes) {
  if (group.ids.length === 0) continue
  lines.push(`### ${group.kind}`, '')
  for (const id of group.ids) {
    const entry = corpus.find(one => one.id === id)
    const carriedBy = entry !== undefined && 'escapes' in entry.verdict ? entry.verdict.carriedBy : ''
    lines.push(`- **${id}** — carried by ${carriedBy}`)
  }
  lines.push('')
}

if (measured.surprises.length > 0) {
  lines.push('## Disagreements between the corpus and the ruleset', '')
  for (const surprise of measured.surprises) {
    lines.push(`- **${surprise.id}** — expected ${surprise.expected}, got ${surprise.got}`)
  }
  lines.push('')
}

console.log(lines.join('\n'))
