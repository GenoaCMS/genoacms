import { Project } from 'ts-morph'
import { assemble } from '../src/emit.js'
import { compileToWebEsModule } from '../src/compile.js'
import { injectGuards } from '../src/guards/inject.js'
import { bridgeRuntime, BRIDGE_FACTORY, BRIDGE_ORIGINS } from '../src/guards/runtime.js'
import { analyze } from '../src/index.js'
import { DEFAULT_TARGET } from '../src/target.js'
import { shape, ceilings } from './profiles.js'
import type { Profile } from './profiles.js'

/**
 * Building the two artifacts E4 compares, and timing what E5 plots.
 *
 * ## The control is built here, not by the adapter
 *
 * `compileBundle` cannot emit an unguarded artifact and is not given a way to: the design states
 * that no path compiles a component the guards cannot bound, and a flag meaning "skip them" would
 * be exactly such a path, reachable by anything able to call the adapter. So this harness assembles
 * and compiles both variants itself, from the same body and the same emitted signature, and the only
 * difference between them is whether `injectGuards` ran.
 *
 *     assemble(body) ──┬──▶ + bridge helper ─────────▶ compile   control
 *                      └──▶ injectGuards ─────────────▶ compile   guarded
 *
 * **The control still carries the data bridge**, and has to. The emitted signature builds `bridge`
 * from a helper the compiler appends, so a control without it does not run at all — and the bridge
 * is not a guard. What E4 attributes to the guards is what the guards cost, so the one thing that
 * differs between these two artifacts is the fuel, depth and allocation calls and the counters
 * behind them.
 *
 * ## Measuring, not reporting
 *
 * Nothing here decides what the numbers mean or writes them down. It produces them on demand, so
 * that the evaluation can run them on the machine it intends to quote and this package's test suite
 * can assert that the harness works without asserting a timing.
 */

interface Built {
  code: string
  bytes: number
}

/** Both artifacts for one body, from one assembly. */
interface Pair {
  control: Built
  guarded: Built
}

const built = (code: string): Built => ({ code, bytes: Buffer.byteLength(code, 'utf8') })

const compiled = async (source: string): Promise<Built> => {
  const result = await compileToWebEsModule(source, 'web-esmodule', DEFAULT_TARGET)
  if (result.executableCode === undefined) {
    throw new Error(`harness: did not compile — ${result.diagnostics.map(one => one.message).join(', ')}`)
  }
  return built(result.executableCode)
}

/** The assembled source plus the one appended helper a component cannot run without. */
const withoutGuards = (source: string): string =>
  `${source}\n${bridgeRuntime(BRIDGE_FACTORY, BRIDGE_ORIGINS, [])}`

const pairFor = async (body: string): Promise<Pair> => {
  const { source, prologueLines } = assemble(body, shape)
  const injected = injectGuards(source, ceilings, prologueLines, [])

  return {
    control: await compiled(withoutGuards(source)),
    guarded: await compiled(injected.source)
  }
}

/** A component, loaded and ready to call. */
type Runnable = (count: number, ...rest: unknown[]) => unknown

const loaded = async (code: string): Promise<Runnable> => {
  const module = await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  )
  return module.default as Runnable
}

/**
 * How long a component takes, over repeated calls.
 *
 * The **median** rather than the mean: one scheduling hiccup moves a mean and does not move a
 * median, and what is being compared is the ordinary cost of a call rather than the worst one.
 */
const millisecondsPerCall = async (code: string, count: number, calls: number): Promise<number> => {
  const component = await loaded(code)
  const samples: number[] = []

  for (let i = 0; i < calls; i++) {
    const started = performance.now()
    component(count)
    samples.push(performance.now() - started)
  }

  samples.sort((one, other) => one - other)
  return samples[Math.floor(samples.length / 2)]
}

interface Overhead {
  profile: Profile['name']
  size: number
  /** Bytes the guards add to the artifact, and what that is as a proportion. */
  bytes: { control: number, guarded: number }
  /** Median milliseconds per call, for each variant. */
  milliseconds: { control: number, guarded: number }
}

/**
 * One profile at one size, measured both ways.
 *
 * `warmup` calls run before anything is timed. Without them the first sample carries the cost of the
 * engine compiling the function, which is a real cost and not the one being attributed to guards.
 */
const overheadOf = async (
  profile: Profile,
  size: number,
  { count = 200, calls = 25, warmup = 5 } = {}
): Promise<Overhead> => {
  const { control, guarded } = await pairFor(profile.body(size))

  await millisecondsPerCall(control.code, count, warmup)
  await millisecondsPerCall(guarded.code, count, warmup)

  return {
    profile: profile.name,
    size,
    bytes: { control: control.bytes, guarded: guarded.bytes },
    milliseconds: {
      control: await millisecondsPerCall(control.code, count, calls),
      guarded: await millisecondsPerCall(guarded.code, count, calls)
    }
  }
}

/** How large a source is, counted as the analyzer sees it rather than in characters. */
const astNodes = (body: string): number => {
  const { source } = assemble(body, shape)
  return new Project({ useInMemoryFileSystem: true })
    .createSourceFile('component.ts', source)
    .getDescendants().length
}

interface Latency {
  profile: Profile['name']
  size: number
  nodes: number
  /** Median milliseconds for one analysis. */
  milliseconds: number
}

/**
 * How long analysis takes on one body, against how large that body is.
 *
 * Plotted against **AST node count** rather than line count or bytes, because the rules walk a tree:
 * a thousand lines of straight-line assignment and a thousand lines of nested calls are the same
 * length and not the same work.
 */
const latencyOf = async (profile: Profile, size: number, runs = 15): Promise<Latency> => {
  const body = profile.body(size)
  const samples: number[] = []

  for (let i = 0; i < runs; i++) {
    const started = performance.now()
    analyze({ body, shape, fetchOrigins: [] })
    samples.push(performance.now() - started)
  }

  samples.sort((one, other) => one - other)
  return {
    profile: profile.name,
    size,
    nodes: astNodes(body),
    milliseconds: samples[Math.floor(samples.length / 2)]
  }
}

/**
 * The proportion `guarded` adds over `control`, as a percentage.
 *
 * **Not a number when the control was too fast to measure.** A percentage taken from zero is not a
 * large overhead, it is a missing measurement — the clock ran out of resolution — and reporting one
 * would put a figure in the evaluation that describes the timer rather than the guards. The report
 * prints a dash, and the reader knows to run a larger size.
 */
const overheadPercent = (control: number, guarded: number): number =>
  control === 0 ? Number.NaN : ((guarded - control) / control) * 100

export { pairFor, overheadOf, latencyOf, astNodes, overheadPercent, millisecondsPerCall }
export type { Built, Pair, Overhead, Latency }
