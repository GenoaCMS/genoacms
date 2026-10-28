import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import fc from 'fast-check'
import { streamToString } from './utils.server'

const SLOVAK = 'Návod na používanie aplikácie — ľščťžýáíéúäôň € 😀'

const bytesOf = (text: string): Buffer => Buffer.from(text, 'utf8')

const splitAt = (bytes: Buffer, offsets: number[]): Buffer[] => {
  const cuts = [0, ...[...new Set(offsets)].sort((a, b) => a - b), bytes.length]
  return cuts.slice(1).map((end, index) => bytes.subarray(cuts[index], end))
}

const splitEvery = (bytes: Buffer, size: number): Buffer[] =>
  Array.from({ length: Math.ceil(bytes.length / size) }, (_, index) => bytes.subarray(index * size, (index + 1) * size))

const read = async (chunks: Array<string | Buffer>): Promise<string> => await streamToString(Readable.from(chunks))

const largeSlovakDocument = (): { paragraphs: string[] } => {
  const count = Math.ceil(1024 * 1024 / bytesOf(SLOVAK).length)
  return { paragraphs: Array.from({ length: count }, (_, index) => `${index}: ${SLOVAK}`) }
}

describe('streamToString', () => {
  it.fails('STS-6: a character split between two chunks is read whole', async () => {
    const bytes = bytesOf('používanie')
    const insideZ = bytes.indexOf(0xC5) + 1

    expect(await read(splitAt(bytes, [insideZ]))).toBe('používanie')
  })

  it.fails('STS-6: a large Slovak document over many chunks reads back exactly', async () => {
    const document = largeSlovakDocument()
    const serialized = JSON.stringify(document)

    for (const size of [64 * 1024, 7]) {
      const text = await read(splitEvery(bytesOf(serialized), size))
      expect(text).not.toContain('\uFFFD')
      expect(text).toBe(serialized)
      expect(JSON.parse(text)).toEqual(document)
    }
  })

  it.fails('STS-6: any text split anywhere reads back the same', async () => {
    const textAndOffsets = fc.string({ unit: 'binary', minLength: 1 }).chain(text =>
      fc.tuple(fc.constant(text), fc.array(fc.nat({ max: bytesOf(text).length })))
    )
    await fc.assert(fc.asyncProperty(textAndOffsets, async ([text, offsets]) => {
      expect(await read(splitAt(bytesOf(text), offsets))).toBe(text)
    }), { examples: [[['ž', [1]]]] })
  })

  it.fails('STS-6: string chunks count as their UTF-8 bytes', async () => {
    const rest = bytesOf('žívanie')

    expect(await read(['Návod na pou', ...splitAt(rest, [1])])).toBe('Návod na používanie')
  })

  it.fails('STS-6: invalid bytes decode to U+FFFD and a byte order mark is kept', async () => {
    const chunks = [Buffer.from([0xEF, 0xBB]), Buffer.from([0xBF, 0x61, 0xFF])]

    expect(await read(chunks)).toBe('\uFEFFa\uFFFD')
  })

  it('STS-6: a stream that fails fails the read with its error', async () => {
    const failure = new Error('boom')
    const failing = new Readable({ read () {} })
    failing.push(bytesOf(SLOVAK))
    setImmediate(() => failing.destroy(failure))

    await expect(streamToString(failing)).rejects.toBe(failure)
  })
})
