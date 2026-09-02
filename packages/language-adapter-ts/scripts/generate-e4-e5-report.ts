import { profiles, SIZES } from '../evidence/profiles.js'
import { overheadOf, latencyOf, overheadPercent } from '../evidence/harness.js'

/**
 * Runs E4 and E5 and prints what they measured.
 *
 * **The numbers belong to the machine that ran it**, which is why this is a script rather than a
 * test: an assertion about a timing would fail when a laptop was busy and prove nothing when it was
 * not. The evaluation runs this where it intends to quote the result, and states the machine.
 *
 * What the test suite guarantees instead is that the comparison is honest — that the two artifacts
 * differ only in the guards, compute the same answer, and that the arithmetic is right.
 */

const SIZE = 8
const round = (value: number): string => value.toFixed(2)
/** A percentage, or a dash where the control was too fast for the clock to say anything. */
const percent = (value: number): string => Number.isNaN(value) ? '—' : `${value.toFixed(2)}%`

const lines: string[] = [
  '# E4 — runtime guard overhead, E5 — analysis latency',
  '',
  '> Measured on the machine that ran this script. Guard density varies sharply by control-flow',
  '> shape, so overhead is reported **per profile**: an average would conceal the worst case, which',
  '> is the figure that matters.',
  '',
  '> The control carries the data bridge and no guards. The bridge is not a guard, and a component',
  '> without it does not run, so leaving it out would attribute its cost to the guards.',
  '',
  '## E4 — overhead per profile',
  '',
  `Each profile at size ${SIZE}.`,
  '',
  '| Profile | Dominated by | Control (ms) | Guarded (ms) | Time | Control (B) | Guarded (B) | Size |',
  '| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |'
]

for (const profile of profiles) {
  const measured = await overheadOf(profile, SIZE)
  const time = overheadPercent(measured.milliseconds.control, measured.milliseconds.guarded)
  const bytes = overheadPercent(measured.bytes.control, measured.bytes.guarded)
  lines.push(
    `| ${profile.name} | ${profile.dominatedBy} | ${round(measured.milliseconds.control)} | ` +
    `${round(measured.milliseconds.guarded)} | ${percent(time)} | ${measured.bytes.control} | ` +
    `${measured.bytes.guarded} | ${percent(bytes)} |`
  )
}

lines.push(
  '',
  '## E5 — analysis latency against AST node count',
  '',
  'Plotted against nodes rather than lines: the rules walk a tree, and two sources of one length',
  'are not one amount of work.',
  '',
  '| Profile | Size | AST nodes | Analysis (ms) |',
  '| :--- | ---: | ---: | ---: |'
)

for (const profile of profiles) {
  for (const size of SIZES) {
    const measured = await latencyOf(profile, size)
    lines.push(
      `| ${profile.name} | ${size} | ${measured.nodes} | ${round(measured.milliseconds)} |`
    )
  }
}

console.log(lines.join('\n'))
